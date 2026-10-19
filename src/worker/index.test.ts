import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import worker, { type WorkerEnv } from "./index.ts"
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
