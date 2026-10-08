import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { DateTime, Effect, Layer, TestClock } from "effect"
import { assert, it } from "@effect/vitest"
import { bearerMatches } from "./admin-auth.ts"
import { migrationStatements, type D1Database, type D1Prepared } from "./d1-store.ts"
import { handleLaporan, laporanHttpError, TurnstileRejected, type LaporanEdge } from "./laporan-http.ts"
import { LaporanEdge as EdgeTag } from "./laporan-http.ts"
import { laporanStoreLayer, type PhotoBucket, type StoredPhoto } from "./laporan-store.ts"
import { LAPORAN_STATEMENTS } from "./laporan-schema.ts"
import { PRESIGN_EXPIRES_SEC, SignError } from "./r2-sign.ts"

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
        const results = statement.all(...(bound as never[])) as T[]
        return Promise.resolve({ results })
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

const memoryBucket = () => {
  const objects = new Map<string, Uint8Array>()
  const puts: string[] = []
  const gets: string[] = []
  const bucket: PhotoBucket = {
    get(key) {
      gets.push(key)
      const bytes = objects.get(key)
      if (bytes == null) return Promise.resolve(null)
      const body: StoredPhoto = { body: bytes.slice() }
      return Promise.resolve(body)
    },
    put(key, value) {
      puts.push(key)
      if (value instanceof Uint8Array) {
        objects.set(key, value.slice())
        return Promise.resolve()
      }
      if (value instanceof ArrayBuffer) {
        objects.set(key, new Uint8Array(value))
        return Promise.resolve()
      }
      return new Response(value).arrayBuffer().then((buffer) => {
        objects.set(key, new Uint8Array(buffer))
      })
    },
    delete(key) {
      objects.delete(key)
      return Promise.resolve()
    },
  }
  return { bucket, objects, puts, gets }
}

const harness = (presign: boolean | "fail") => {
  const raw = new DatabaseSync(":memory:")
  for (const statement of migrationStatements()) raw.exec(statement)
  const photos = memoryBucket()
  const edge: LaporanEdge["Type"] = {
    adminSecret: SECRET,
    siteKey: "site-key",
    verify: (token) => (token === "ok" ? Effect.void : Effect.fail(new TurnstileRejected())),
    presign:
      presign === "fail"
        ? () => Effect.fail(new SignError({ message: "sign" }))
        : presign
          ? (id, nowMs) =>
              Effect.succeed(
                `https://acct.r2.cloudflarestorage.com/monitor-pangan-laporan/pending/${id}.jpg?X-Amz-Expires=${PRESIGN_EXPIRES_SEC}&X-Amz-Date=${nowMs}`,
              )
          : null,
  }
  const layer = Layer.mergeAll(laporanStoreLayer(sqliteD1(raw), photos.bucket), Layer.succeed(EdgeTag, edge))
  const call = (request: Request) =>
    handleLaporan(request).pipe(
      Effect.provide(layer),
      Effect.catchAll((error) => {
        const response = laporanHttpError(error)
        if (response != null) return Effect.succeed(response)
        return Effect.die(error)
      }),
      Effect.flatMap((response) =>
        response == null ? Effect.die("laporan route returned null") : Effect.succeed(response),
      ),
    )
  const count = (table: string) => Number((raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
  const cell = (sql: string, ...values: unknown[]) => raw.prepare(sql).get(...(values as never[])) as Record<string, unknown>
  return { raw, photos, call, count, cell }
}

const bodyOf = (response: Response) =>
  Effect.tryPromise({
    try: () => response.json() as Promise<Record<string, unknown>>,
    catch: (cause) => cause,
  })

const submitBody = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  commodityId: "beras",
  outlet: "pasar",
  price: 16000,
  placeCode: "3273",
  alias: null,
  photo: false,
  turnstileToken: "ok",
  seen_on: "1999-01-01",
  ...patch,
})

const post = (origin: ReturnType<typeof harness>, id: string, patch?: Record<string, unknown>) =>
  origin.call(
    new Request("https://monitor.naufaldi.com/api/laporan", {
      method: "POST",
      body: JSON.stringify(submitBody(id, patch)),
    }),
  )

const auth = (secret = SECRET) => ({ authorization: `Bearer ${secret}` })

it.effect("schema.sql and the worker migration share the laporan_warga statements", () =>
  Effect.sync(() => {
    const file = readFileSync("db/schema.sql", "utf8")
    const migrated = migrationStatements()
    for (const statement of LAPORAN_STATEMENTS) {
      assert.ok(file.includes(statement))
      assert.ok(migrated.includes(statement))
    }
    const lifecycle = JSON.parse(readFileSync("r2-lifecycle.json", "utf8")) as {
      rules: Array<{ conditions: { prefix: string }; deleteObjectsTransition: { condition: { maxAge: number } } }>
    }
    assert.strictEqual(lifecycle.rules.length, 1)
    assert.strictEqual(lifecycle.rules[0]?.conditions.prefix, "decided/")
    assert.strictEqual(lifecycle.rules[0]?.deleteObjectsTransition.condition.maxAge, 2592000)
    assert.strictEqual(JSON.stringify(lifecycle).includes("pending/"), false)
  }),
)

it.effect("the admin secret matches only the full bearer value", () =>
  Effect.sync(() => {
    assert.strictEqual(bearerMatches(null, SECRET), false)
    assert.strictEqual(bearerMatches(`Bearer ${SECRET}`, "short"), false)
    assert.strictEqual(bearerMatches("Bearer nope-nope-nope-nope-nope-nope", SECRET), false)
    assert.strictEqual(bearerMatches(`Bearer ${SECRET}`, SECRET), true)
  }),
)

it.effect("a bad turnstile token or a bad field inserts nothing", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T03:00:00.000Z"))
    const rejected = yield* post(origin, "11111111-1111-4111-8111-111111111111", { turnstileToken: "bad" })
    assert.strictEqual(rejected.status, 400)
    assert.strictEqual(origin.count("laporan_warga"), 0)
    const cases = [
      { outlet: "minimarket" },
      { price: 50 },
      { price: 1_000_001 },
      { placeCode: "0000" },
      { commodityId: "kopi" },
      { alias: "x".repeat(41) },
      { alias: "lihat https://evil.example" },
    ]
    for (const patch of cases) {
      const response = yield* post(origin, "22222222-2222-4222-8222-222222222222", patch)
      assert.strictEqual(response.status, 400)
    }
    assert.strictEqual(origin.count("laporan_warga"), 0)
    assert.strictEqual(origin.count("prices_daily"), 0)
  }),
)

it.effect("seen_on is the Jakarta civil date and a repeated id inserts one row", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-07T17:30:00.000Z"))
    const id = "33333333-3333-4333-8333-333333333333"
    const pricesBefore = origin.count("prices_daily")
    const first = yield* post(origin, id, { photo: true })
    const again = yield* post(origin, id, { photo: true, price: 99999 })
    assert.strictEqual(first.status, 200)
    assert.strictEqual(again.status, 200)
    assert.strictEqual(origin.count("laporan_warga"), 1)
    assert.strictEqual(origin.count("prices_daily"), pricesBefore)
    const row = origin.cell("SELECT seen_on, price, photo_key, status FROM laporan_warga WHERE id = ?", id)
    assert.strictEqual(row.seen_on, "2026-10-08")
    assert.strictEqual(row.price, 16000)
    assert.strictEqual(row.status, "pending")
    assert.strictEqual(row.photo_key, `pending/${id}.jpg`)
    const payload = yield* bodyOf(first)
    const uploadUrl = String(payload.uploadUrl)
    assert.ok(uploadUrl.includes(`pending/${id}.jpg`))
    assert.ok(uploadUrl.includes(`X-Amz-Expires=${PRESIGN_EXPIRES_SEC}`))
    assert.ok(PRESIGN_EXPIRES_SEC <= 600)
  }),
)

it.effect("the public payload is reviewed rows only and admin calls need the secret", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T01:00:00.000Z"))
    const pendingId = "44444444-4444-4444-8444-444444444444"
    const reviewedId = "55555555-5555-4555-8555-555555555555"
    const rejectedId = "66666666-6666-4666-8666-666666666666"
    yield* post(origin, pendingId)
    yield* post(origin, reviewedId, { placeCode: "3274", price: 13000 })
    yield* post(origin, rejectedId, { outlet: "ritel", placeCode: "3275", price: 18000 })
    const locked = yield* origin.call(new Request("https://monitor.naufaldi.com/api/admin/queue"))
    assert.strictEqual(locked.status, 401)
    const wrong = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/queue", { headers: auth("z".repeat(32)) }),
    )
    assert.strictEqual(wrong.status, 401)
    const approve = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id: reviewedId, action: "approve", evidence: "board" }),
      }),
    )
    assert.strictEqual(approve.status, 200)
    const reject = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id: rejectedId, action: "reject", note: "bukan harga" }),
      }),
    )
    assert.strictEqual(reject.status, 200)
    const listed = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/laporan?outlet=pasar&window=1"),
    )
    assert.strictEqual(listed.status, 200)
    const payload = yield* bodyOf(listed)
    const rows = payload.rows as Array<Record<string, unknown>>
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0]?.id, reviewedId)
    assert.strictEqual(rows[0]?.outlet, "pasar")
    assert.strictEqual("status" in (rows[0] ?? {}), false)
    assert.strictEqual("reviewNote" in (rows[0] ?? {}), false)
    assert.strictEqual("photoKey" in (rows[0] ?? {}), false)
    const ritel = yield* origin.call(new Request("https://monitor.naufaldi.com/api/laporan?outlet=ritel&window=1"))
    const ritelRows = ((yield* bodyOf(ritel)).rows as unknown[])
    assert.strictEqual(ritelRows.length, 0)
    const foto = yield* origin.call(new Request(`https://monitor.naufaldi.com/foto/${pendingId}`))
    assert.strictEqual(foto.status, 404)
    assert.strictEqual(origin.photos.gets.includes(`pending/${pendingId}.jpg`), false)
  }),
)

it.effect("approve moves the object, a repeat is a no-op, and a bad transition is 409", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T03:00:00.000Z"))
    const id = "77777777-7777-4777-8777-777777777777"
    yield* post(origin, id, { photo: true })
    origin.photos.objects.set(`pending/${id}.jpg`, Uint8Array.from([1, 2, 3]))
    const approve = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id, action: "approve", evidence: "receipt" }),
      }),
    )
    assert.strictEqual(approve.status, 200)
    const row = origin.cell("SELECT status, evidence, reviewed_at, photo_key FROM laporan_warga WHERE id = ?", id)
    assert.strictEqual(row.status, "reviewed")
    assert.strictEqual(row.evidence, "receipt")
    assert.strictEqual(row.photo_key, `decided/${id}.jpg`)
    assert.strictEqual(typeof row.reviewed_at, "string")
    assert.strictEqual(origin.photos.objects.has(`pending/${id}.jpg`), false)
    assert.deepStrictEqual([...(origin.photos.objects.get(`decided/${id}.jpg`) ?? [])], [1, 2, 3])
    const putsAfter = origin.photos.puts.length
    const again = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id, action: "approve", evidence: "none" }),
      }),
    )
    assert.strictEqual(again.status, 200)
    const same = origin.cell("SELECT evidence, reviewed_at FROM laporan_warga WHERE id = ?", id)
    assert.strictEqual(same.evidence, "receipt")
    assert.strictEqual(same.reviewed_at, row.reviewed_at)
    assert.strictEqual(origin.photos.puts.length, putsAfter)
    const conflict = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id, action: "reject", note: "salah" }),
      }),
    )
    assert.strictEqual(conflict.status, 409)
    assert.strictEqual(origin.cell("SELECT status FROM laporan_warga WHERE id = ?", id).status, "reviewed")
    const foto = yield* origin.call(new Request(`https://monitor.naufaldi.com/foto/${id}`))
    assert.strictEqual(foto.status, 200)
    assert.strictEqual(foto.headers.get("cache-control"), "public, max-age=600")
    const bytes = yield* Effect.tryPromise({
      try: () => foto.arrayBuffer(),
      catch: (cause) => cause,
    })
    assert.deepStrictEqual([...new Uint8Array(bytes)], [1, 2, 3])
  }),
)

it.effect("a missing pending object still decides and clears the photo key", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T03:00:00.000Z"))
    const id = "88888888-8888-4888-8888-888888888888"
    yield* post(origin, id, { photo: true })
    const response = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id, action: "reject", note: "foto hilang" }),
      }),
    )
    assert.strictEqual(response.status, 200)
    const row = origin.cell("SELECT status, photo_key, review_note FROM laporan_warga WHERE id = ?", id)
    assert.strictEqual(row.status, "rejected")
    assert.strictEqual(row.photo_key, null)
    assert.strictEqual(row.review_note, "foto hilang")
  }),
)

it.effect("takedown rejects the row, rewrites the object, and hides the photo", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T03:00:00.000Z"))
    const id = "99999999-9999-4999-8999-999999999999"
    yield* post(origin, id, { photo: true })
    origin.photos.objects.set(`pending/${id}.jpg`, Uint8Array.from([9]))
    yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id, action: "approve", evidence: "board" }),
      }),
    )
    const puts = origin.photos.puts.length
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T05:00:00.000Z"))
    const takedown = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id, action: "takedown", note: "tarik" }),
      }),
    )
    assert.strictEqual(takedown.status, 200)
    const row = origin.cell("SELECT status, review_note, reviewed_at FROM laporan_warga WHERE id = ?", id)
    assert.strictEqual(row.status, "rejected")
    assert.strictEqual(row.review_note, "tarik")
    assert.strictEqual(row.reviewed_at, "2026-10-08T05:00:00.000Z")
    assert.ok(origin.photos.puts.length > puts)
    assert.strictEqual(origin.photos.puts[origin.photos.puts.length - 1], `decided/${id}.jpg`)
    const listed = yield* origin.call(new Request("https://monitor.naufaldi.com/api/laporan?outlet=pasar&window=1"))
    assert.strictEqual(((yield* bodyOf(listed)).rows as unknown[]).length, 0)
    const foto = yield* origin.call(new Request(`https://monitor.naufaldi.com/foto/${id}`))
    assert.strictEqual(foto.status, 404)
    const repeat = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id, action: "takedown", note: "lagi" }),
      }),
    )
    assert.strictEqual(repeat.status, 200)
    assert.strictEqual(origin.cell("SELECT review_note FROM laporan_warga WHERE id = ?", id).review_note, "tarik")
  }),
)

it.effect("the queue is oldest first and names a missing PIHPS hint", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T01:00:00.000Z"))
    const older = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const newer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    yield* post(origin, older, { commodityId: "cabai-merah", price: 40000 })
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T02:00:00.000Z"))
    yield* post(origin, newer)
    origin.raw.exec(
      "INSERT INTO prices_daily (date, commodity_id, region_code, level, price, source_id) VALUES ('2026-10-08', 'beras', '32', 'eceran', 14000, 'pihps')",
    )
    const response = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/queue", { headers: auth() }),
    )
    const items = ((yield* bodyOf(response)).items as Array<Record<string, unknown>>)
    assert.strictEqual(items[0]?.id, older)
    assert.strictEqual(items[0]?.pihpsPrice, null)
    assert.strictEqual(items[1]?.id, newer)
    assert.strictEqual(items[1]?.pihpsPrice, 14000)
  }),
)

it.effect("hasPhoto flips off after 30 days and older pages stay reachable", () =>
  Effect.gen(function* () {
    const origin = harness(true)
    const oldId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    const newId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    yield* TestClock.setTime(DateTime.unsafeMake("2026-08-01T03:00:00.000Z"))
    yield* post(origin, oldId, { photo: true, price: 12000 })
    origin.photos.objects.set(`pending/${oldId}.jpg`, Uint8Array.from([4]))
    yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id: oldId, action: "approve", evidence: "receipt" }),
      }),
    )
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T03:00:00.000Z"))
    yield* post(origin, newId, { price: 15000, placeCode: "3275" })
    yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/admin/decide", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ id: newId, action: "approve", evidence: "none" }),
      }),
    )
    const windowed = yield* origin.call(
      new Request("https://monitor.naufaldi.com/api/laporan?outlet=pasar&window=1&limit=1"),
    )
    const page = yield* bodyOf(windowed)
    const rows = page.rows as Array<Record<string, unknown>>
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0]?.id, newId)
    assert.strictEqual(rows[0]?.hasPhoto, false)
    assert.strictEqual(page.nextCursor, null)
    const next = String(page.resumeCursor ?? "")
    assert.ok(next.length > 0)
    const older = yield* origin.call(
      new Request(`https://monitor.naufaldi.com/api/laporan?outlet=pasar&window=0&limit=1&cursor=${encodeURIComponent(next)}`),
    )
    const olderRows = ((yield* bodyOf(older)).rows as Array<Record<string, unknown>>)
    assert.strictEqual(olderRows[0]?.id, oldId)
    assert.strictEqual(olderRows[0]?.hasPhoto, false)
    assert.strictEqual(olderRows[0]?.evidence, "receipt")
  }),
)

it.effect("a signing failure keeps the pending row and omits the upload url", () =>
  Effect.gen(function* () {
    const origin = harness("fail")
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T03:00:00.000Z"))
    const id = "ffffffff-ffff-4fff-8fff-ffffffffffff"
    const response = yield* post(origin, id, { photo: true })
    assert.strictEqual(response.status, 200)
    const body = yield* bodyOf(response)
    assert.strictEqual(body.id, id)
    assert.strictEqual(body.uploadUrl, null)
    assert.strictEqual(origin.count("laporan_warga"), 1)
    assert.strictEqual(origin.count("prices_daily"), 0)
    assert.strictEqual(origin.cell("SELECT status, photo_key FROM laporan_warga WHERE id = ?", id).status, "pending")
  }),
)

it.effect("a photo submit without signing credentials inserts nothing", () =>
  Effect.gen(function* () {
    const origin = harness(false)
    yield* TestClock.setTime(DateTime.unsafeMake("2026-10-08T03:00:00.000Z"))
    const response = yield* post(origin, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", { photo: true })
    assert.strictEqual(response.status, 503)
    assert.strictEqual(origin.count("laporan_warga"), 0)
  }),
)
