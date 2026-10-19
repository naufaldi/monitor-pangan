import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { d1PriceStoreLayer, ensureMigrated, type D1Database } from "./d1-store.ts"
import { PriceStore } from "./ingest.ts"
import { sqliteFixture } from "./sqlite-test.ts"
import type { PihpsPriceCell } from "../data/pihps-grid.ts"
import { COMMODITY_ROWS, REGION_ROWS } from "../data/pihps-catalog.ts"

const date = "2026-10-19"
const checked = "2026-10-19T10:15:00Z"
const cell = { date, commodityId: "beras", regionCode: "31", price: 16000 }
const rows: PihpsPriceCell[] = REGION_ROWS.flatMap(([regionCode]) => COMMODITY_ROWS.map(([commodityId]) => ({ date, regionCode, commodityId, price: 17000 }))).slice(0, 41)

it.effect("pending/error recover, and live prices survive empty/error retries", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    for (const from of ["pending", "error"] as const) {
      yield* store.upsertDay(date, from, [], checked)
      yield* store.upsertDay(date, "empty", [], checked)
      assert.deepStrictEqual(yield* store.coverageSince("2026-10-18"), [{ date, status: "empty" }])
    }
    yield* store.upsertDay(date, "pending", [], checked)
    yield* store.upsertDay(date, "live", [cell], checked)
    for (const status of ["pending", "empty", "error"] as const) yield* store.upsertDay(date, status, [], checked)
    assert.deepStrictEqual(yield* store.coverageSince("2026-10-18"), [{ date, status: "live" }])
    assert.strictEqual((yield* store.freshSince("2026-10-18")).prices["2026-10-19:beras:31"], 16000)
    yield* store.upsertDay(date, "live", [{ ...cell, price: 18000 }], checked)
    assert.strictEqual((yield* store.freshSince("2026-10-18")).prices["2026-10-19:beras:31"], 18000)
  }).pipe(Effect.provide(d1PriceStoreLayer(fixture.db)))
}))

it.effect("partial batches report only confirmed new cells and never mark a day complete", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  let batches = 0
  const db: D1Database = { ...fixture.db, batch: (statements) => ++batches === 2 ? Promise.reject(new Error("injected batch failure")) : fixture.db.batch(statements) }
  yield* ensureMigrated(db)
  batches = 0
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const error = yield* Effect.flip(store.upsertDay(date, "live", rows, checked))
    assert.strictEqual(error.rowsUpserted, 40)
    assert.deepStrictEqual(yield* store.coverageSince("2026-10-18"), [])
    assert.strictEqual(Object.keys((yield* store.freshSince("2026-10-18")).prices).length, 40)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))

it.effect("failed live refresh retains previous prices and its live marker", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* fixture.price(date, "11", 13000)
  yield* fixture.coverage(date, "live")
  let batches = 0
  const db: D1Database = { ...fixture.db, batch: (statements) => ++batches === 2 ? Promise.reject(new Error("injected batch failure")) : fixture.db.batch(statements) }
  yield* ensureMigrated(db)
  batches = 0
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const error = yield* Effect.flip(store.upsertDay(date, "live", rows, checked))
    assert.strictEqual(error.rowsUpserted, 39)
    assert.strictEqual((yield* store.freshSince("2026-10-18")).prices["2026-10-19:beras:11"], 13000)
    assert.deepStrictEqual(yield* store.coverageSince("2026-10-18"), [{ date, status: "live" }])
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))

it.effect("rejects corrupt persisted coverage rather than skipping an unresolved day", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* fixture.coverage("2026-02-30", "live")
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const error = yield* Effect.flip(store.coverageSince("2026-01-01"))
    assert.strictEqual(error._tag, "StoreError")
  }).pipe(Effect.provide(d1PriceStoreLayer(fixture.db)))
}))

it.effect("publication failure rolls back refresh and marker while retaining confirmed new cells", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* fixture.price(date, "11", 13000)
  yield* fixture.coverage(date, "live")
  yield* Effect.sync(() => fixture.sqlite.exec("CREATE TRIGGER reject_marker BEFORE UPDATE ON source_days BEGIN SELECT RAISE(ABORT, 'injected marker failure'); END"))
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const error = yield* Effect.flip(store.upsertDay(date, "live", rows, checked))
    assert.strictEqual(error.rowsUpserted, 40)
    assert.strictEqual((yield* store.freshSince("2026-10-18")).prices["2026-10-19:beras:11"], 13000)
    assert.strictEqual(Object.keys((yield* store.freshSince("2026-10-18")).prices).length, 41)
    assert.deepStrictEqual(yield* store.coverageSince("2026-10-18"), [{ date, status: "live" }])
  }).pipe(Effect.provide(d1PriceStoreLayer(fixture.db)))
}))

it.effect("repeated execution resets confirmed counts for each failed attempt", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  let batches = 0
  const db: D1Database = { ...fixture.db, batch: (statements) => ++batches === 2 ? Promise.reject(new Error("injected batch failure")) : fixture.db.batch(statements) }
  yield* ensureMigrated(db)
  batches = 0
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const write = store.upsertDay(date, "live", rows, checked)
    assert.strictEqual((yield* Effect.flip(write)).rowsUpserted, 40)
    batches = 0
    assert.strictEqual((yield* Effect.flip(write)).rowsUpserted, 0)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
}))

it.effect("live retries update attempt timestamps without downgrading coverage or prices", () => Effect.gen(function* () {
  const fixture = yield* sqliteFixture
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    yield* store.upsertDay(date, "live", [cell], "2026-10-19T07:15:00Z")
    for (const [status, attemptedAt] of [
      ["empty", "2026-10-19T10:15:00Z"],
      ["error", "2026-10-19T11:15:00Z"],
      ["pending", "2026-10-19T12:15:00Z"],
    ] as const) {
      yield* store.upsertDay(date, status, [], attemptedAt)
      const marker = fixture.sqlite.prepare("SELECT status, checked_at FROM source_days WHERE date = ?").get(date)
      assert.strictEqual(marker?.checked_at, attemptedAt)
      assert.strictEqual(marker?.status, "live")
      assert.strictEqual((yield* store.freshSince("2026-10-18")).prices["2026-10-19:beras:31"], 16000)
    }
  }).pipe(Effect.provide(d1PriceStoreLayer(fixture.db)))
}))
