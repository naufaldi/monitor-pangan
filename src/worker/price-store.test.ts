import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import historical2018 from "../data/fixtures/pihps-2018-10-09.json"
import historical2025 from "../data/fixtures/pihps-2025-10-30.json"
import { SnapshotSchema } from "../data/price-schema.ts"
import { REGION_ROWS } from "../data/pihps-catalog.ts"
import { PriceReadStore, priceReadStoreLayer } from "./price-store.ts"
import { sqliteFixture } from "./sqlite-test.ts"

for (const fixture of [historical2018, historical2025]) {
  it.effect(`reads recovered ${fixture.date} observations without asserting survey completion`, () => Effect.gen(function* () {
    const db = yield* sqliteFixture
    for (const row of fixture.rows) yield* db.price(fixture.date, row.regionCode, row.price)
    const snapshot = yield* Effect.gen(function* () {
      return yield* (yield* PriceReadStore).snapshot(fixture.date, fixture.commodityId)
    }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
    yield* Schema.decodeUnknown(SnapshotSchema)(snapshot)
    assert.strictEqual(snapshot.nationalAvg, fixture.expected.nationalAvg)
    assert.strictEqual(snapshot.pricedCount, 34)
    assert.deepStrictEqual(snapshot.rows.map((row) => row.regionCode), REGION_ROWS.map(([code]) => code))
    assert.strictEqual(snapshot.rows.find((row) => row.regionCode === "93")?.price, null)
  }))
}

it.effect("distinguishes unknown coverage, verified empty and commodity-empty live surveys", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  for (const status of [null, "pending", "error"]) {
    if (status != null) yield* db.coverage("2020-01-01", status)
    const error = yield* Effect.flip(Effect.gen(function* () {
      return yield* (yield* PriceReadStore).snapshot("2020-01-01", "beras")
    }).pipe(Effect.provide(priceReadStoreLayer(db.db))))
    assert.strictEqual(error._tag, "CoverageUnavailable")
  }
  for (const status of ["empty", "live"]) {
    yield* db.coverage("2020-01-01", status)
    const snapshot = yield* Effect.gen(function* () {
      return yield* (yield* PriceReadStore).snapshot("2020-01-01", "beras")
    }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
    assert.strictEqual(snapshot.nationalAvg, null)
    assert.strictEqual(snapshot.pricedCount, 0)
    assert.strictEqual(snapshot.rows.length, 38)
  }
}))

it.effect("bounds sparse selected points to the authoritative national page", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  for (const day of ["01", "02", "03", "04"]) yield* db.price(`2026-09-${day}`, "11", 10000)
  yield* db.price("2026-09-02", "31", 20000)
  yield* db.price("2026-09-03", "31", 21000)
  yield* db.price("2026-09-02", "12", 90000, "beras", "panelharga")
  yield* db.price("2026-09-01", "11", 80000, "beras", "pihps", "grosir")
  yield* db.price("2026-09-01", "13", 70000, "cabai-merah")
  yield* Effect.gen(function* () {
    const store = yield* PriceReadStore
    const query = { commodityId: "beras", regionCode: "31", from: "2026-09-01", to: "2026-09-04", limit: 2 }
    const first = yield* store.trendPage(query)
    assert.deepStrictEqual(first.national, [{ date: "2026-09-01", price: 10000 }, { date: "2026-09-02", price: 15000 }])
    assert.deepStrictEqual(first.selected, [{ date: "2026-09-02", price: 20000 }])
    assert.strictEqual(first.nextCursor, "2026-09-02")
    const last = yield* store.trendPage({ ...query, cursor: first.nextCursor! })
    assert.deepStrictEqual(last.selected, [{ date: "2026-09-03", price: 21000 }])
    assert.deepStrictEqual(last.national.map((point) => point.date), ["2026-09-03", "2026-09-04"])
    assert.strictEqual(last.nextCursor, null)
    const exhausted = yield* store.trendPage({ ...query, cursor: query.to })
    assert.deepStrictEqual(exhausted, { national: [], selected: [], nextCursor: null })
    const one = yield* store.trendPage({ ...query, regionCode: undefined, from: query.to })
    assert.deepStrictEqual(one, { national: [{ date: query.to, price: 10000 }], selected: null, nextCursor: null })
  }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
}))

it.effect("validates D1 prices before exposing snapshots or aggregates", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  for (const price of [-1, 0, "corrupt"]) {
    yield* db.price("2026-09-01", "11", price)
    yield* Effect.gen(function* () {
      const store = yield* PriceReadStore
      assert.strictEqual((yield* Effect.flip(store.snapshot("2026-09-01", "beras")))._tag, "PriceReadError")
      assert.strictEqual((yield* Effect.flip(store.trendPage({ commodityId: "beras", from: "2026-09-01", to: "2026-09-01", limit: 2 })))._tag, "PriceReadError")
    }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
  }
}))

it.effect("returns verified zero-point trends and rejects unknown empty coverage", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* Effect.gen(function* () {
    const store = yield* PriceReadStore
    const query = { commodityId: "beras", from: "2026-09-01", to: "2026-09-01", limit: 500 }
    assert.strictEqual((yield* Effect.flip(store.trendPage(query)))._tag, "CoverageUnavailable")
    yield* db.coverage(query.from, "empty")
    assert.deepStrictEqual(yield* store.trendPage(query), { national: [], selected: null, nextCursor: null })
  }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
}))

it.effect("requires every eligible day for an absent range and permits weekend-only ranges", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* db.coverage("2026-09-03", "empty")
  yield* Effect.gen(function* () {
    const store = yield* PriceReadStore
    const query = { commodityId: "beras", from: "2026-09-03", to: "2026-09-06", limit: 500 }
    for (const status of [null, "pending", "error"]) {
      if (status != null) yield* db.coverage("2026-09-04", status)
      assert.strictEqual((yield* Effect.flip(store.trendPage(query)))._tag, "CoverageUnavailable")
    }
    yield* db.coverage("2026-09-04", "live")
    assert.deepStrictEqual(yield* store.trendPage(query), { national: [], selected: null, nextCursor: null })
    assert.deepStrictEqual(yield* store.trendPage({ ...query, from: "2026-09-05" }), { national: [], selected: null, nextCursor: null })
  }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
}))

it.effect("rejects duplicate official observations instead of silently averaging or overwriting", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* Effect.sync(() => db.sqlite.exec("DROP TABLE prices_daily; CREATE TABLE prices_daily (date TEXT, commodity_id TEXT, region_code TEXT, price INTEGER, source_id TEXT, level TEXT)"))
  yield* db.price("2026-09-01", "11", 10000)
  yield* db.price("2026-09-01", "11", 20000)
  yield* Effect.gen(function* () {
    const store = yield* PriceReadStore
    assert.strictEqual((yield* Effect.flip(store.snapshot("2026-09-01", "beras")))._tag, "PriceReadError")
    assert.strictEqual((yield* Effect.flip(store.trendPage({ commodityId: "beras", from: "2026-09-01", to: "2026-09-01", limit: 1 })))._tag, "PriceReadError")
  }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
}))

it.effect("rejects unknown province rows even when a completed survey has no observations", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* db.coverage("2026-09-01", "live")
  yield* Effect.sync(() => db.sqlite.prepare("INSERT INTO regions VALUES ('99', 'Unknown province', 'province')").run())
  yield* db.price("2026-09-01", "99", null)
  yield* Effect.gen(function* () {
    const store = yield* PriceReadStore
    assert.strictEqual((yield* Effect.flip(store.snapshot("2026-09-01", "beras")))._tag, "PriceReadError")
    assert.strictEqual((yield* Effect.flip(store.trendPage({ commodityId: "beras", from: "2026-09-01", to: "2026-09-01", limit: 1 })))._tag, "PriceReadError")
  }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
}))

it.effect("concatenates all cursor pages into sorted unique national and provincial dates", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  for (const day of ["01", "02", "03", "04", "07"]) yield* db.price(`2026-09-${day}`, "11", 10000)
  for (const day of ["02", "04", "07"]) yield* db.price(`2026-09-${day}`, "31", 20000)
  yield* Effect.gen(function* () {
    const store = yield* PriceReadStore
    let cursor: string | undefined
    const national: string[] = []
    const selected: string[] = []
    do {
      const page = yield* store.trendPage({ commodityId: "beras", regionCode: "31", from: "2026-09-01", to: "2026-09-07", limit: 2, cursor })
      national.push(...page.national.map((point) => point.date))
      selected.push(...(page.selected ?? []).map((point) => point.date))
      cursor = page.nextCursor ?? undefined
    } while (cursor != null)
    assert.deepStrictEqual(national, ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"])
    assert.deepStrictEqual(selected, ["2026-09-02", "2026-09-04", "2026-09-07"])
  }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
}))

it.effect("finishes an empty range or exhausted cursor at the final canonical calendar date", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* db.coverage("9999-12-31", "empty")
  yield* Effect.gen(function* () {
    const store = yield* PriceReadStore
    const query = { commodityId: "beras", from: "9999-12-31", to: "9999-12-31", limit: 1 }
    assert.deepStrictEqual(yield* store.trendPage(query), { national: [], selected: null, nextCursor: null })
    assert.deepStrictEqual(yield* store.trendPage({ ...query, cursor: query.to }), { national: [], selected: null, nextCursor: null })
  }).pipe(Effect.provide(priceReadStoreLayer(db.db)))
}))
