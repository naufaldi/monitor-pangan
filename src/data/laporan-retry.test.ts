import { DatabaseSync } from "node:sqlite"
import { Effect, Either, Layer } from "effect"
import { assert, it } from "@effect/vitest"
import { migrationStatements, type D1Database, type D1Prepared } from "../worker/d1-store.ts"
import { handleLaporan, laporanHttpError, LaporanEdge, TurnstileRejected } from "../worker/laporan-http.ts"
import { laporanStoreLayer, type PhotoBucket } from "../worker/laporan-store.ts"
import { PRESIGN_EXPIRES_SEC } from "../worker/r2-sign.ts"
import { postReport } from "./laporan-client.ts"
import { isDefiniteReject, retryBody, type ReportAttempt } from "./laporan-retry.ts"

const SECRET = "0123456789abcdef0123456789abcdef"

const sqliteD1 = (db: DatabaseSync): D1Database => ({
  prepare(sql: string): D1Prepared {
    const statement = db.prepare(sql)
    let bound: unknown[] = []
    const prepared: D1Prepared = {
      bind(...values: unknown[]) {
        bound = values
        return prepared
      },
      all<T>() {
        return Promise.resolve({ results: statement.all(...(bound as never[])) as T[] })
      },
      run() {
        const info = statement.run(...(bound as never[]))
        return Promise.resolve({ meta: { changes: Number(info.changes) } })
      },
    }
    return prepared
  },
  batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()))
  },
  exec(sql: string) {
    db.exec(sql)
    return Promise.resolve()
  },
})

const memoryBucket = (): PhotoBucket => {
  const objects = new Map<string, Uint8Array>()
  return {
    get(key) {
      const bytes = objects.get(key)
      return Promise.resolve(bytes == null ? null : { body: bytes.slice() })
    },
    put(key, value) {
      if (value instanceof Uint8Array) objects.set(key, value.slice())
      else if (value instanceof ArrayBuffer) objects.set(key, new Uint8Array(value))
      else return new Response(value).arrayBuffer().then((buffer) => void objects.set(key, new Uint8Array(buffer)))
      return Promise.resolve()
    },
    delete(key) {
      objects.delete(key)
      return Promise.resolve()
    },
  }
}

/** Real Worker over SQLite. `lost` drops the response AFTER the handler persisted the row. */
const makeOrigin = (presign: boolean) => {
  const raw = new DatabaseSync(":memory:")
  for (const statement of migrationStatements()) raw.exec(statement)
  const edge: LaporanEdge["Type"] = {
    adminSecret: SECRET,
    siteKey: "site-key",
    verify: (token) => (token === "ok" ? Effect.void : Effect.fail(new TurnstileRejected())),
    presign: presign
      ? (id, nowMs) =>
          Effect.succeed(
            `https://acct.r2.cloudflarestorage.com/monitor-pangan-laporan/pending/${id}.jpg?X-Amz-Expires=${PRESIGN_EXPIRES_SEC}&X-Amz-Date=${nowMs}`,
          )
      : null,
  }
  const layer = Layer.mergeAll(laporanStoreLayer(sqliteD1(raw), memoryBucket()), Layer.succeed(LaporanEdge, edge))
  const call = (request: Request) =>
    handleLaporan(request).pipe(
      Effect.provide(layer),
      Effect.catchAll((error) => {
        const response = laporanHttpError(error)
        return response == null ? Effect.die(error) : Effect.succeed(response)
      }),
      Effect.flatMap((response) => (response == null ? Effect.die("laporan route returned null") : Effect.succeed(response))),
    )
  const state = { lost: false }
  const sent: Array<Record<string, unknown>> = []
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(String(input), "https://test.local")
    if (url.pathname === "/api/laporan" && init?.method === "POST" && typeof init.body === "string") {
      sent.push(JSON.parse(init.body) as Record<string, unknown>)
    }
    return Effect.runPromise(call(new Request(url, init))).then((response) => {
      if (state.lost) {
        state.lost = false
        throw new Error("response lost")
      }
      return response
    })
  }
  const count = () => Number((raw.prepare("SELECT COUNT(*) AS n FROM laporan_warga").get() as { n: number }).n)
  const cell = (sql: string, ...values: unknown[]) => raw.prepare(sql).get(...(values as never[])) as Record<string, unknown>
  return { call, fetcher, state, sent, count, cell }
}

const draft = (id: string, patch: Partial<ReportAttempt> = {}): ReportAttempt => ({
  id,
  commodityId: "beras",
  outlet: "pasar",
  price: 16000,
  placeCode: "3273",
  alias: null,
  photo: false,
  ...patch,
})

it.effect("classifies pre-insert rejects as definite and every other failure as uncertain", () =>
  Effect.sync(() => {
    for (const status of [400, 503]) assert.strictEqual(isDefiniteReject(status), true)
    for (const status of [0, 200, 500, 502, 504, 429]) assert.strictEqual(isDefiniteReject(status), false)
  }),
)

it.effect("a retry body derives from the captured attempt, not the current editable fields", () =>
  Effect.sync(() => {
    const original = draft("11111111-1111-4111-8111-111111111111")
    const edited: ReportAttempt = { ...original, price: 15000, alias: "changed" }
    const body = retryBody(original, "ok")
    assert.strictEqual(body.id, original.id)
    assert.strictEqual(body.price, 16000)
    assert.strictEqual(body.alias, null)
    assert.strictEqual(body.turnstileToken, "ok")
    assert.notStrictEqual(body.price, edited.price)
  }),
)

it.effect("an uncertain submit then an edited retry resends the original and retains one row", () =>
  Effect.gen(function* () {
    const origin = makeOrigin(true)
    const id = crypto.randomUUID()
    const original = draft(id)
    // The Worker persists Rp16.000 but the response is lost: the client sees an uncertain failure.
    origin.state.lost = true
    const first = yield* Effect.either(postReport(retryBody(original, "ok"), origin.fetcher))
    assert.ok(Either.isLeft(first))
    if (Either.isLeft(first)) {
      assert.strictEqual(first.left.status, 0)
      assert.strictEqual(isDefiniteReject(first.left.status), false)
    }
    assert.strictEqual(origin.count(), 1)
    assert.strictEqual(origin.cell("SELECT price FROM laporan_warga WHERE id = ?", id).price, 16000)
    // Recovery resends the captured original (Rp16.000), never the edited Rp15.000, under the same UUID.
    const replay = yield* postReport(retryBody(original, "ok"), origin.fetcher)
    assert.strictEqual(replay.id, id)
    assert.strictEqual(replay.receiptToken, null, "a replay must not reissue the private receipt token")
    assert.strictEqual(origin.sent[1]?.price, 16000, "the retry payload is the original attempt, not the edit")
    assert.strictEqual(origin.count(), 1)
    assert.strictEqual(origin.cell("SELECT price FROM laporan_warga WHERE id = ?", id).price, 16000)
  }),
)

it.effect("a definite reject stores nothing and keeps the same UUID recoverable", () =>
  Effect.gen(function* () {
    const origin = makeOrigin(true)
    const id = crypto.randomUUID()
    const rejected = yield* Effect.either(postReport(retryBody(draft(id, { price: 50 }), "ok"), origin.fetcher))
    assert.ok(Either.isLeft(rejected))
    if (Either.isLeft(rejected)) {
      assert.strictEqual(rejected.left.status, 400)
      assert.strictEqual(isDefiniteReject(rejected.left.status), true)
    }
    assert.strictEqual(origin.count(), 0)
    // Nothing was stored, so the visitor fixes the price and retries the same UUID successfully.
    const saved = yield* postReport(retryBody(draft(id), "ok"), origin.fetcher)
    assert.match(String(saved.receiptToken), /^[0-9a-f]{64}$/)
    assert.strictEqual(origin.count(), 1)
    assert.strictEqual(origin.cell("SELECT price FROM laporan_warga WHERE id = ?", id).price, 16000)
  }),
)

it.effect("a photo submit without upload credentials is a definite reject that stores nothing", () =>
  Effect.gen(function* () {
    const origin = makeOrigin(false)
    const id = crypto.randomUUID()
    const rejected = yield* Effect.either(postReport(retryBody(draft(id, { photo: true }), "ok"), origin.fetcher))
    assert.ok(Either.isLeft(rejected))
    if (Either.isLeft(rejected)) {
      assert.strictEqual(rejected.left.status, 503)
      assert.strictEqual(isDefiniteReject(rejected.left.status), true)
    }
    assert.strictEqual(origin.count(), 0)
  }),
)

it.effect("an explicit new report stores the edits under a fresh UUID and keeps the original", () =>
  Effect.gen(function* () {
    const origin = makeOrigin(true)
    const firstId = crypto.randomUUID()
    origin.state.lost = true
    yield* Effect.either(postReport(retryBody(draft(firstId), "ok"), origin.fetcher))
    const newId = crypto.randomUUID()
    const saved = yield* postReport(retryBody(draft(newId, { price: 15000 }), "ok"), origin.fetcher)
    assert.match(String(saved.receiptToken), /^[0-9a-f]{64}$/)
    assert.strictEqual(origin.count(), 2)
    assert.strictEqual(origin.cell("SELECT price FROM laporan_warga WHERE id = ?", firstId).price, 16000)
    assert.strictEqual(origin.cell("SELECT price FROM laporan_warga WHERE id = ?", newId).price, 15000)
  }),
)

it.effect("a lost-response photo replay keeps the normalized alias and offers upload continuation", () =>
  Effect.gen(function* () {
    const origin = makeOrigin(true)
    const id = crypto.randomUUID()
    const attempt = draft(id, { alias: "Bu Sri", photo: true })
    origin.state.lost = true
    yield* Effect.either(postReport(retryBody(attempt, "ok"), origin.fetcher))
    const stored = origin.cell("SELECT alias, photo_key FROM laporan_warga WHERE id = ?", id)
    assert.strictEqual(stored.alias, "Bu Sri")
    assert.strictEqual(stored.photo_key, `pending/${id}.jpg`)
    // The replay returns a fresh upload URL for the SAME pending object, so the original photo can finish.
    const replay = yield* postReport(retryBody(attempt, "ok"), origin.fetcher)
    assert.strictEqual(replay.receiptToken, null)
    assert.ok(replay.uploadUrl != null && replay.uploadUrl.includes(`pending/${id}.jpg`))
    assert.strictEqual(origin.count(), 1)
    // The wire replay stays generic: no persisted status, alias, evidence, note, or receipt secret.
    const raw = yield* origin.call(
      new Request("https://test.local/api/laporan", { method: "POST", body: JSON.stringify(retryBody(attempt, "ok")) }),
    )
    const payload = (yield* Effect.tryPromise({ try: () => raw.json() as Promise<Record<string, unknown>>, catch: (cause) => cause }))
    assert.strictEqual(payload.status, "pending")
    assert.strictEqual(payload.receiptToken, null)
    const serialized = JSON.stringify(payload)
    for (const secret of ["Bu Sri", "decided/"]) assert.ok(!serialized.includes(secret))
    for (const field of ["alias", "evidence", "reviewNote", "photoKey"]) assert.ok(!(field in payload))
  }),
)