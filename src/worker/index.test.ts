import { assert, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, TestClock } from "effect"
import worker, { handleRequest, handleScheduled, HTML_FRESH_BUDGET, workerLayer, type WorkerEnv } from "./index.ts"
import { PihpsFetchError, PihpsSource, PriceStore } from "./ingest.ts"
import { sqliteFixture } from "./sqlite-test.ts"

const json = (response: Response) => Effect.promise(() => response.json() as Promise<Record<string, unknown>>)
const text = (response: Response) => Effect.promise(() => response.text())
const environment = (db: WorkerEnv["DB"]): WorkerEnv => ({
  DB: db,
  ASSETS: { fetch: (request) => Promise.resolve(new URL(request.url).pathname.endsWith(".css")
    ? new Response("body{}", { headers: { "content-type": "text/css" } })
    : new Response('<head><meta name="robots" content="index, follow"></head><body>app</body>', { headers: { "content-type": "text/html" } })) },
  PHOTOS: { get: () => Promise.resolve(null), put: () => Promise.resolve(undefined), delete: () => Promise.resolve(undefined) },
  ADMIN_SECRET: "test-admin-secret-with-32-characters",
  TURNSTILE_SITE_KEY: "public-site-key",
})

it.effect("dispatches new price APIs before the asset shell", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* db.price("2018-10-09", "11", 10300)
  const env = environment(db.db)
  const snapshot = yield* Effect.promise(() => worker.fetch(new Request("https://example.test/api/snapshot?date=2018-10-09&commodity=beras"), env))
  assert.strictEqual(snapshot.status, 200)
  assert.strictEqual((yield* json(snapshot)).nationalAvg, 10300)
  const trend = yield* Effect.promise(() => worker.fetch(new Request("https://example.test/api/trend?from=2018-10-09&to=2018-10-09&commodity=beras"), env))
  assert.deepStrictEqual((yield* json(trend)).national, [{ date: "2018-10-09", price: 10300 }])
}))

it.effect("preserves freshness JSON, HTML injection, admin metadata, citizen APIs and assets", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* db.price("2026-09-17", "31", 16950)
  const env = environment(db.db)
  const fetch = (path: string, headers?: HeadersInit) => Effect.promise(() => worker.fetch(new Request(`https://example.test${path}`, { headers }), env))
  const fresh = yield* json(yield* fetch("/api/pihps/fresh?after=2026-09-16"))
  assert.strictEqual(fresh.latestDate, "2026-09-17")
  assert.strictEqual((fresh.prices as Record<string, number>)["2026-09-17:beras:31"], 16950)
  const html = yield* fetch("/")
  assert.strictEqual(html.headers.get("cache-control"), "no-store")
  assert.ok((yield* text(html)).includes('id="mp-pihps-fresh"'))
  const admin = yield* fetch("/admin")
  assert.strictEqual(admin.headers.get("x-robots-tag"), "noindex, nofollow")
  assert.ok((yield* text(admin)).includes('content="noindex, nofollow"'))
  assert.deepStrictEqual(yield* json(yield* fetch("/api/laporan/meta")), { turnstileSiteKey: "public-site-key" })
  assert.strictEqual((yield* fetch("/api/admin/queue")).status, 401)
  assert.deepStrictEqual(yield* json(yield* fetch("/api/admin/queue", { authorization: "Bearer test-admin-secret-with-32-characters" })), { items: [] })
  const asset = yield* fetch("/assets/app.css")
  assert.strictEqual(asset.headers.get("content-type"), "text/css")
  assert.strictEqual(yield* text(asset), "body{}")
}))

it.effect("exposes freshness read failure without replacing it with a confirmed empty payload", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* Effect.sync(() => db.sqlite.exec("DROP TABLE prices_daily"))
  const env = environment(db.db)
  const fetch = (path: string) => Effect.promise(() => worker.fetch(new Request(`https://example.test${path}`), env))
  const response = yield* fetch("/api/pihps/fresh")
  assert.strictEqual(response.status, 503)
  assert.strictEqual(response.headers.get("cache-control"), "no-store")
  assert.deepStrictEqual(yield* json(response), { error: "freshness_unavailable" })
  const html = yield* fetch("/")
  assert.strictEqual(html.status, 200)
  assert.ok((yield* text(html)).includes("<body>app</body>"))
  assert.ok(!(yield* text(yield* fetch("/"))).includes('id="mp-pihps-fresh"'))
  assert.strictEqual((yield* fetch("/api/pihps/fresh?after=2026-02-30")).status, 400)
}))

it.effect("serves the report page shell when the freshness lookup never settles", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  const stalled = Layer.succeed(PriceStore, {
    coverageSince: () => Effect.succeed([]),
    upsertDay: () => Effect.succeed(0),
    recordJob: () => Effect.void,
    freshSince: () => Effect.never,
  })
  const fiber = yield* handleRequest(new Request("https://example.test/lapor")).pipe(
    Effect.provide(stalled),
    Effect.provide(workerLayer(environment(db.db))),
    Effect.fork,
  )
  yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 0)))
  yield* TestClock.adjust(HTML_FRESH_BUDGET)
  const settled = yield* Fiber.poll(fiber)
  assert.ok(Option.isSome(settled), "HTML must not wait on an unbounded freshness lookup")
  const html = yield* Fiber.join(fiber)
  assert.strictEqual(html.status, 200)
  assert.strictEqual(html.headers.get("cache-control"), "no-store")
  const body = yield* text(html)
  assert.ok(body.includes("<body>app</body>"))
  assert.ok(!body.includes('id="mp-pihps-fresh"'))
}))

it.effect("scheduled execution stays failed after recording an upstream failure", () => Effect.gen(function* () {
  yield* TestClock.setTime(1792401300000)
  const failure = yield* Effect.flip(handleScheduled()).pipe(Effect.provide(Layer.mergeAll(
    Layer.succeed(PihpsSource, { fetchGrid: () => Effect.fail(new PihpsFetchError({ message: "upstream" })) }),
    Layer.succeed(PriceStore, {
      coverageSince: () => Effect.succeed([]),
      upsertDay: () => Effect.succeed(0),
      recordJob: () => Effect.void,
      freshSince: () => Effect.succeed({ latestDate: null, dates: [], prices: {} }),
    }),
  )))
  assert.strictEqual(failure._tag, "PihpsFetchError")
}))

it.effect("the actual scheduled handler rejects waitUntil when coverage storage fails", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  const db = { ...fixture.db, prepare: (sql: string) => {
    const statement = fixture.db.prepare(sql)
    if (!sql.startsWith("SELECT date, status FROM source_days")) return statement
    return { ...statement, bind: () => ({ ...statement, all: <T>() => Promise.reject<T>(new Error("injected coverage failure")) }) }
  } }
  let pending: Promise<unknown> | undefined
  worker.scheduled(undefined, environment(db), { waitUntil: (promise) => { pending = promise } })
  assert.ok(pending)
  const failure = yield* Effect.flip(Effect.tryPromise({ try: () => pending!, catch: () => "scheduled rejected" as const }))
  assert.strictEqual(failure, "scheduled rejected")
  assert.strictEqual(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM job_runs WHERE status = 'error'").get()?.count, 1)
}))
