import { readFileSync } from "node:fs"
import { Effect, Fiber, TestClock } from "effect"
import { assert, it } from "@effect/vitest"
import { sqliteFixture } from "./sqlite-test.ts"
import { PriceStore } from "./ingest.ts"
import { COMMODITY_ROWS, REGION_ROWS } from "../data/pihps-catalog.ts"
import { STATIC_LIVE_THROUGH } from "../data/fresh-prices.ts"
import { migrationStatements, ensureMigrated, d1PriceStoreLayer, FRESH_CACHE_MAX_AGE_MS, FRESH_EDGE_BUDGET, FRESH_REVISION_SQL, SCHEMA_VERSION, SCHEMA_VERSION_SQL, type D1Database, type D1Prepared, type FreshEdgeCache } from "./d1-store.ts"

it.effect("splits the D1 schema into complete statements", () =>
  Effect.sync(() => {
    const statements = migrationStatements()
    assert.ok(statements.length > 5)
    const commodities = statements[0]
    assert.ok(commodities?.startsWith("CREATE TABLE IF NOT EXISTS commodities"))
    assert.ok(commodities?.includes("PRIMARY KEY"))
    assert.ok(statements.some((statement) => statement.startsWith("CREATE TABLE IF NOT EXISTS source_days")))
    const schema = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8")
    const joined = statements.join("\n")
    for (const needle of [
      "CREATE TABLE IF NOT EXISTS schema_version",
      "CREATE TABLE IF NOT EXISTS pihps_fresh_state",
      "CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_insert",
      "CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_delete",
      "CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_archive",
    ]) {
      assert.ok(joined.includes(needle), needle)
      assert.ok(schema.includes(needle), needle)
    }
    for (const statement of statements) {
      const opened = [...statement].filter((char) => char === "(").length
      const closed = [...statement].filter((char) => char === ")").length
      assert.strictEqual(opened, closed)
    }
  }),
)

it.effect("a failed migration is retried before store access", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* Effect.sync(() => fixture.sqlite.exec("UPDATE schema_version SET version = 0"))
  let attempts = 0
  const db: D1Database = { ...fixture.db, batch: (statements) => ++attempts === 1 ? Promise.reject(new Error("injected migration failure")) : fixture.db.batch(statements) }
  assert.strictEqual((yield* Effect.flip(ensureMigrated(db)))._tag, "StoreError")
  yield* ensureMigrated(db)
  assert.strictEqual(attempts, 2)
  yield* ensureMigrated(db)
  assert.strictEqual(attempts, 2)
}))

it.effect("full provincial days fit the D1 bound-parameter limit", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  let largestBinding = 0
  const prepare = (sql: string): D1Prepared => {
    const statement = fixture.db.prepare(sql)
    return { ...statement, bind: (...values) => {
      largestBinding = Math.max(largestBinding, values.length)
      assert.ok(values.length <= 100)
      return statement.bind(...values)
    } }
  }
  const db = { ...fixture.db, prepare }
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const rows = REGION_ROWS.slice(0, 34).flatMap(([regionCode]) => COMMODITY_ROWS.map(([commodityId]) => ({ date: "2026-10-19", regionCode, commodityId, price: 15000 })))
    assert.strictEqual(yield* store.upsertDay("2026-10-19", "live", rows, "2026-10-19T10:15:00Z"), 340)
    assert.strictEqual(Object.keys((yield* store.freshSince("2026-10-18")).prices).length, 340)
    assert.strictEqual(largestBinding, 3)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))

it.effect("rejects untrusted D1 write counts instead of inventing confirmed progress", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  let corrupt = false
  const db = { ...fixture.db, batch: (statements: D1Prepared[]) => corrupt ? Promise.resolve([{ meta: { changes: "40" } }]) : fixture.db.batch(statements) }
  yield* ensureMigrated(db)
  corrupt = true
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const failure = yield* Effect.flip(store.upsertDay("2026-10-19", "live", [{ date: "2026-10-19", commodityId: "beras", regionCode: "31", price: 15000 }], "2026-10-19T10:15:00Z"))
    assert.strictEqual(failure.rowsUpserted, 0)
    assert.deepStrictEqual(yield* store.coverageSince("2026-10-18"), [])
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))

it.effect("cold migrations leave room for one day's reads/writes within the D1 query limit", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  let queries = 0
  const prepare = (sql: string, values: unknown[] = []): D1Prepared => {
    const statement = fixture.db.prepare(sql).bind(...values)
    return {
      bind: (...bound) => prepare(sql, bound),
      all: <T>() => { queries++; return statement.all<T>() },
      run: () => { queries++; return statement.run() },
    }
  }
  const db = { ...fixture.db, prepare }
  yield* Effect.sync(() => fixture.sqlite.exec("UPDATE schema_version SET version = 0"))
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    yield* store.coverageSince("2026-09-16")
    const rows = REGION_ROWS.slice(0, 34).flatMap(([regionCode]) => COMMODITY_ROWS.map(([commodityId]) => ({ date: "2026-10-19", regionCode, commodityId, price: 15000 })))
    yield* store.upsertDay("2026-10-19", "live", rows, "2026-10-19T10:15:00Z")
    yield* store.recordJob({ startedAt: "2026-10-19T10:15:00Z", status: "complete", rowsUpserted: 340, note: "cold full-day fixture" })
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
  assert.ok(queries <= 50, `cold migration and full-day storage used ${queries} D1 queries`)
  assert.strictEqual(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM prices_daily").get()?.count, 340)
  assert.strictEqual(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM commodities").get()?.count, 10)
  assert.strictEqual(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM regions").get()?.count, 38)
}))

it.effect("freshness includes only official retail rows and rejects malformed observations", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* db.price("2026-10-19", "31", 15000)
  yield* db.price("2026-10-20", "31", 90000, "beras", "panelharga")
  yield* db.price("2026-10-20", "31", 90000, "beras", "pihps", "grosir")
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    assert.deepStrictEqual(yield* store.freshSince("2026-10-18"), { latestDate: "2026-10-19", dates: ["2026-10-19"], prices: { "2026-10-19:beras:31": 15000 } })
    for (const price of [0, -1, "corrupt"]) {
      yield* db.price("2026-10-19", "31", price)
      assert.strictEqual((yield* Effect.flip(store.freshSince("2026-10-18")))._tag, "StoreError")
    }
    yield* db.price("2026-10-19", "31", 15000)
    yield* db.price("2026-10-40", "31", 15000)
    assert.strictEqual((yield* Effect.flip(store.freshSince("2026-10-18")))._tag, "StoreError")
  }).pipe(Effect.provide(d1PriceStoreLayer(db.db)))
}))

const FRESH_SQL = "SELECT date, commodity_id, region_code, price FROM prices_daily"
/** Counts the heavy fresh-price read and the revision probe against the real SQLite schema. */
const counting = (db: D1Database, faults = { revision: false, fresh: false }) => {
  const counts = { fresh: 0, revision: 0 }
  const wrap = (sql: string, statement: D1Prepared): D1Prepared => ({
    bind: (...values) => wrap(sql, statement.bind(...values)),
    all: <T>() => {
      if (sql.startsWith(FRESH_SQL)) {
        counts.fresh++
        if (faults.fresh) return Promise.reject<{ results: T[] }>(new Error("injected fresh failure"))
      }
      if (sql === FRESH_REVISION_SQL) {
        counts.revision++
        if (faults.revision) return Promise.reject<{ results: T[] }>(new Error("injected revision failure"))
      }
      return statement.all<T>()
    },
    run: () => statement.run(),
  })
  return { counts, db: { ...db, prepare: (sql: string) => wrap(sql, db.prepare(sql)) } satisfies D1Database }
}
const day = (date: string, price: number) => REGION_ROWS.slice(0, 2).map(([regionCode]) => ({ date, regionCode, commodityId: "beras", price }))

it.effect("the public fresh payload is read once per published revision, including older-day corrections", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  const { counts, db } = counting(fixture.db)
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    yield* store.upsertDay("2026-10-19", "live", day("2026-10-19", 15000), "2026-10-19T10:15:00Z")
    const first = yield* store.freshSince(STATIC_LIVE_THROUGH)
    for (let i = 0; i < 4; i++) assert.deepStrictEqual(yield* store.freshSince(STATIC_LIVE_THROUGH), first)
    assert.deepStrictEqual(counts, { fresh: 1, revision: 5 })

    // A completed ingest of a new day publishes an outbox event.
    yield* store.upsertDay("2026-10-20", "live", day("2026-10-20", 15100), "2026-10-20T10:15:00Z")
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).latestDate, "2026-10-20")
    // A correction of an older day changes no latest date but still invalidates.
    yield* store.upsertDay("2026-10-19", "live", day("2026-10-19", 14000), "2026-10-20T11:15:00Z")
    const corrected = yield* store.freshSince(STATIC_LIVE_THROUGH)
    assert.strictEqual(corrected.prices["2026-10-19:beras:11"], 14000)
    assert.strictEqual(counts.fresh, 3)
    // A cell inserted outside the batch bumps the revision. A job row alone does not.
    yield* fixture.price("2026-10-21", "11", 15200)
    yield* store.recordJob({ startedAt: "2026-10-21T10:15:00Z", status: "error", rowsUpserted: 1, note: "partial" })
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-21:beras:11"], 15200)
    // Other `after` values bypass the cache and stay exact.
    assert.deepStrictEqual((yield* store.freshSince("2026-10-20")).dates, ["2026-10-21"])
    assert.strictEqual(counts.fresh, 5)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))

it.effect("an in-place UPDATE stays on the current snapshot, an inserted cell invalidates, and a revision failure reads the store", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  const faults = { revision: false, fresh: false }
  const { counts, db } = counting(fixture.db, faults)
  const update = (price: number) => Effect.sync(() => fixture.sqlite.prepare("UPDATE prices_daily SET price = ? WHERE date = '2026-10-19' AND region_code = '11'").run(price))
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    yield* fixture.price("2026-10-19", "11", 15000)
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-19:beras:11"], 15000)
    yield* update(14000)
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-19:beras:11"], 15000)
    yield* TestClock.adjust(FRESH_CACHE_MAX_AGE_MS)
    // The memo expired. The snapshot for this revision is still served, so the table is not scanned.
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-19:beras:11"], 15000)
    assert.strictEqual(counts.fresh, 1)
    // INSERT OR REPLACE takes a new rowid and bumps the revision, so it is visible at once.
    yield* fixture.price("2026-10-19", "11", 13500)
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-19:beras:11"], 13500)
    faults.revision = true
    yield* update(13000)
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-19:beras:11"], 13000)
    assert.strictEqual(counts.fresh, 3)
    // A store failure is not cached; recovery is visible on the next request.
    faults.revision = false
    // A job row changes no price, so the cached revision stands.
    yield* store.recordJob({ startedAt: "2026-10-19T10:15:00Z", status: "complete", rowsUpserted: 0, note: "revision" })
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-19:beras:11"], 13500)
    // A new cell bumps the revision. A failed read of that revision is not cached.
    faults.fresh = true
    yield* fixture.price("2026-10-22", "12", 13000)
    assert.strictEqual((yield* Effect.flip(store.freshSince(STATIC_LIVE_THROUGH)))._tag, "StoreError")
    faults.fresh = false
    const recovered = yield* store.freshSince(STATIC_LIVE_THROUGH)
    assert.strictEqual(recovered.prices["2026-10-19:beras:11"], 13000)
    assert.strictEqual(recovered.prices["2026-10-22:beras:12"], 13000)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))

/** An in-memory Cache API that keeps headers but, like a real colo cache, may also hang or fail. */
const fakeEdge = () => {
  const entries = new Map<string, { body: string; headers: Headers }>()
  const mode = { broken: false, stalled: false }
  const edge: FreshEdgeCache = {
    match: (key) => mode.stalled ? new Promise(() => undefined) : mode.broken ? Promise.reject(new Error("edge down"))
      : Promise.resolve(entries.has(key) ? new Response(entries.get(key)!.body, { headers: entries.get(key)!.headers }) : undefined),
    put: (key, response) => mode.stalled ? new Promise(() => undefined) : mode.broken ? Promise.reject(new Error("edge down"))
      : response.text().then((body) => { entries.set(key, { body, headers: response.headers }) }),
  }
  return { entries, edge, mode }
}

it.effect("databases never share a cached payload, and the edge cache serves another isolate", () => Effect.gen(function* () {
  const first = yield* sqliteFixture
  const second = yield* sqliteFixture
  yield* first.price("2026-10-19", "11", 15000)
  yield* second.price("2026-10-19", "11", 99000)
  const { entries, edge, mode } = fakeEdge()
  const read = (db: D1Database) => Effect.flatMap(PriceStore, (store) => store.freshSince(STATIC_LIVE_THROUGH)).pipe(Effect.provide(d1PriceStoreLayer(db, edge)))
  assert.strictEqual((yield* read(first.db)).prices["2026-10-19:beras:11"], 15000)
  assert.strictEqual((yield* read(second.db)).prices["2026-10-19:beras:11"], 99000)
  assert.strictEqual(entries.size, 2)
  const stored = [...entries.values()][0]
  assert.strictEqual(stored?.headers.get("cache-control"), `public, max-age=${FRESH_CACHE_MAX_AGE_MS / 1000}`)
  assert.ok(stored?.headers.get("etag")?.startsWith('"'))
  // A new isolate has an empty module memo (a new binding object) but the same database epoch.
  const isolate = counting(first.db)
  assert.strictEqual((yield* read(isolate.db)).prices["2026-10-19:beras:11"], 15000)
  assert.strictEqual(isolate.counts.fresh, 0)
  // A corrupt edge entry falls through to the snapshot row, not the price table.
  for (const [key, entry] of entries) entries.set(key, { ...entry, body: "{\"latestDate\":1}" })
  const corrupt = counting(first.db)
  assert.strictEqual((yield* read(corrupt.db)).prices["2026-10-19:beras:11"], 15000)
  assert.strictEqual(corrupt.counts.fresh, 0)
  yield* Effect.sync(() => first.sqlite.exec("UPDATE pihps_fresh_state SET payload = '{\"latestDate\":1}'"))
  for (const [key, entry] of entries) entries.set(key, { ...entry, body: "{\"latestDate\":1}" })
  const brokenSnapshot = counting(first.db)
  assert.strictEqual((yield* read(brokenSnapshot.db)).prices["2026-10-19:beras:11"], 15000)
  assert.strictEqual(brokenSnapshot.counts.fresh, 1)
  mode.broken = true
  const offline = counting(second.db)
  assert.strictEqual((yield* read(offline.db)).prices["2026-10-19:beras:11"], 99000)
  assert.strictEqual(offline.counts.fresh, 0)
}))

it.effect("the revision probe reads one primary-key row, not price history", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  const plan = yield* Effect.sync(() => fixture.sqlite.prepare(`EXPLAIN QUERY PLAN ${FRESH_REVISION_SQL}`).all().map((row) => String(row.detail)))
  assert.ok(plan.length > 0 && plan.every((detail) => !detail.startsWith("SCAN") && !detail.includes("prices_daily")), plan.join("\n"))
  assert.ok(plan.some((detail) => detail.includes("pihps_fresh_state")), plan.join("\n"))
}))

it.effect("an edge hit keeps its original age, and expiry reloads the snapshot rather than the price table", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* fixture.price("2026-10-19", "11", 15000)
  const { edge, entries } = fakeEdge()
  const read = (db: D1Database) => Effect.flatMap(PriceStore, (store) => store.freshSince(STATIC_LIVE_THROUGH)).pipe(Effect.provide(d1PriceStoreLayer(db, edge)))
  assert.strictEqual((yield* read(fixture.db)).prices["2026-10-19:beras:11"], 15000)
  yield* Effect.sync(() => fixture.sqlite.prepare("UPDATE prices_daily SET price = 14000").run())
  yield* TestClock.adjust(FRESH_CACHE_MAX_AGE_MS - 1000)
  // A second isolate is served from the edge, but inherits the entry's age, not a new one.
  const isolate = counting(fixture.db)
  assert.strictEqual((yield* read(isolate.db)).prices["2026-10-19:beras:11"], 15000)
  assert.strictEqual(isolate.counts.fresh, 0)
  yield* TestClock.adjust(1000)
  assert.strictEqual((yield* read(isolate.db)).prices["2026-10-19:beras:11"], 15000)
  assert.strictEqual(isolate.counts.fresh, 0)
  // A missing snapshot is the only reason to scan. The scan sees the in-place update and backfills.
  yield* Effect.sync(() => fixture.sqlite.exec("UPDATE pihps_fresh_state SET payload = NULL, payload_revision = NULL"))
  entries.clear()
  const fallback = counting(fixture.db)
  assert.strictEqual((yield* read(fallback.db)).prices["2026-10-19:beras:11"], 14000)
  assert.strictEqual(fallback.counts.fresh, 1)
  assert.strictEqual((yield* read(fallback.db)).prices["2026-10-19:beras:11"], 14000)
  assert.strictEqual(fallback.counts.fresh, 1)
  // An entry without a valid store time (an older deployment's format) is a miss.
  for (const [key, entry] of entries) entries.set(key, { ...entry, headers: new Headers() })
  const legacy = counting(fixture.db)
  assert.strictEqual((yield* read(legacy.db)).prices["2026-10-19:beras:11"], 14000)
  assert.strictEqual(legacy.counts.fresh, 0)
}))

it.effect("a stalled edge cache costs at most its budget on each side of the store read", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* fixture.price("2026-10-19", "11", 15000)
  const { edge, mode } = fakeEdge()
  mode.stalled = true
  const fiber = yield* Effect.flatMap(PriceStore, (store) => store.freshSince(STATIC_LIVE_THROUGH)).pipe(Effect.provide(d1PriceStoreLayer(fixture.db, edge)), Effect.fork)
  yield* TestClock.adjust(FRESH_EDGE_BUDGET)
  yield* TestClock.adjust(FRESH_EDGE_BUDGET)
  const payload = yield* Fiber.join(fiber)
  assert.strictEqual(payload.prices["2026-10-19:beras:11"], 15000)
}))

it.effect("a current schema version skips CREATE and pragma work on a new isolate", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  assert.strictEqual(fixture.sqlite.prepare(SCHEMA_VERSION_SQL).get()?.version, SCHEMA_VERSION)
  const sqls: string[] = []
  const db: D1Database = { ...fixture.db, prepare: (sql: string) => { sqls.push(sql); return fixture.db.prepare(sql) } }
  yield* ensureMigrated(db)
  yield* ensureMigrated(db)
  assert.deepStrictEqual(sqls, [SCHEMA_VERSION_SQL])
}))

it.effect("a database without schema_version migrates, then later isolates short-circuit", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* Effect.sync(() => fixture.sqlite.exec("DROP TABLE schema_version"))
  const schemaWork: string[] = []
  const watch = (sql: string): D1Prepared => {
    if (sql.startsWith("CREATE") || sql.includes("pragma_table_info")) schemaWork.push(sql)
    return fixture.db.prepare(sql)
  }
  yield* ensureMigrated({ ...fixture.db, prepare: watch })
  assert.ok(schemaWork.some((sql) => sql.startsWith("CREATE TABLE IF NOT EXISTS schema_version")))
  assert.ok(schemaWork.some((sql) => sql.includes("pragma_table_info")))
  assert.strictEqual(fixture.sqlite.prepare(SCHEMA_VERSION_SQL).get()?.version, SCHEMA_VERSION)
  schemaWork.length = 0
  yield* ensureMigrated({ ...fixture.db, prepare: watch })
  assert.deepStrictEqual(schemaWork, [])
}))

it.effect("the precomputed snapshot is served for its revision, and a missing snapshot is scanned once", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  const { counts, db } = counting(fixture.db)
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    yield* store.upsertDay("2026-10-19", "live", day("2026-10-19", 15000), "2026-10-19T10:15:00Z")
    const before = fixture.sqlite.prepare(FRESH_REVISION_SQL).get()?.revision
    yield* store.publishFresh()
    assert.strictEqual(counts.fresh, 1)
    assert.strictEqual(fixture.sqlite.prepare("SELECT payload_revision FROM pihps_fresh_state WHERE id = 1").get()?.payload_revision, before)
    const published = yield* store.freshSince(STATIC_LIVE_THROUGH)
    assert.strictEqual(published.prices["2026-10-19:beras:11"], 15000)
    assert.deepStrictEqual(yield* store.freshSince(STATIC_LIVE_THROUGH), published)
    yield* store.publishFresh()
    assert.strictEqual(counts.fresh, 1)
    yield* store.upsertDay("2026-10-20", "live", day("2026-10-20", 15100), "2026-10-20T10:15:00Z")
    assert.notStrictEqual(fixture.sqlite.prepare(FRESH_REVISION_SQL).get()?.revision, before)
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).latestDate, "2026-10-20")
    assert.strictEqual(counts.fresh, 2)
    assert.strictEqual((yield* store.freshSince(STATIC_LIVE_THROUGH)).prices["2026-10-20:beras:11"], 15100)
    assert.strictEqual(counts.fresh, 2)
    yield* Effect.sync(() => fixture.sqlite.exec("UPDATE pihps_fresh_state SET payload = NULL, payload_revision = NULL"))
    const isolate = counting(fixture.db)
    const read = Effect.flatMap(PriceStore, (next) => next.freshSince(STATIC_LIVE_THROUGH)).pipe(Effect.provide(d1PriceStoreLayer(isolate.db)))
    assert.strictEqual((yield* read).latestDate, "2026-10-20")
    assert.strictEqual(isolate.counts.fresh, 1)
    assert.strictEqual((yield* read).prices["2026-10-19:beras:11"], 15000)
    assert.strictEqual(isolate.counts.fresh, 1)
    assert.strictEqual(fixture.sqlite.prepare("SELECT payload_revision = revision AS ready FROM pihps_fresh_state WHERE id = 1").get()?.ready, 1)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))
