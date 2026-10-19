import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { sqliteFixture } from "./sqlite-test.ts"
import { PriceStore } from "./ingest.ts"
import { COMMODITY_ROWS, REGION_ROWS } from "../data/pihps-catalog.ts"
import { migrationStatements, ensureMigrated, d1PriceStoreLayer, type D1Database, type D1Prepared } from "./d1-store.ts"

it.effect("splits the D1 schema into complete statements", () =>
  Effect.sync(() => {
    const statements = migrationStatements()
    assert.ok(statements.length > 5)
    const commodities = statements[0]
    assert.ok(commodities?.startsWith("CREATE TABLE IF NOT EXISTS commodities"))
    assert.ok(commodities?.includes("PRIMARY KEY"))
    assert.ok(statements.some((statement) => statement.startsWith("CREATE TABLE IF NOT EXISTS source_days")))
    for (const statement of statements) {
      const opened = [...statement].filter((char) => char === "(").length
      const closed = [...statement].filter((char) => char === ")").length
      assert.strictEqual(opened, closed)
    }
  }),
)

it.effect("a failed migration is retried before store access", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
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
