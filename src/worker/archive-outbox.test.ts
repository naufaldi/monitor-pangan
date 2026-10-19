import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { sqliteFixture } from "./sqlite-test.ts"
import { d1PriceStoreLayer } from "./d1-store.ts"
import { PriceStore } from "./ingest.ts"

const date = "2026-10-19"
const cell = { date, commodityId: "beras", regionCode: "31", price: 16000 }
const checkedAt = "2026-10-19T10:15:00Z"

it.effect("changed successful days have immutable snapshots; identical retries emit nothing", () => Effect.gen(function* () {
  const { db, sqlite } = yield* sqliteFixture
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    yield* store.upsertDay(date, "live", [cell], checkedAt)
    yield* store.upsertDay(date, "live", [cell], "2026-10-19T11:15:00Z")
    yield* store.upsertDay("2018-10-09", "live", [{ ...cell, date: "2018-10-09", price: 14000 }], checkedAt)
    yield* store.upsertDay(date, "live", [{ ...cell, price: 18000 }], checkedAt)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
  const events = sqlite.prepare("SELECT date, observations_json FROM pihps_archive_events ORDER BY seq").all()
  assert.deepStrictEqual(events.map((row) => row.date), [date, "2018-10-09", date])
  assert.deepStrictEqual(JSON.parse(String(events[0]?.observations_json)), [["beras", "31", 16000, "pihps-grid:2026-10-19:31"]])
  assert.strictEqual(sqlite.prepare("SELECT raw_ref FROM prices_daily WHERE date=?").get(date)?.raw_ref, "pihps-grid:2026-10-19:31")
}))

it.effect("outbox failure rolls back the final refresh and marker without deleting good prices", () => Effect.gen(function* () {
  const { db, sqlite, price, coverage } = yield* sqliteFixture
  yield* price(date, "31", 15000)
  yield* coverage(date, "live")
  sqlite.exec("CREATE TRIGGER reject_archive BEFORE INSERT ON pihps_archive_events BEGIN SELECT RAISE(ABORT, 'injected outbox failure'); END")
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    assert.strictEqual((yield* Effect.flip(store.upsertDay(date, "live", [cell], checkedAt)))._tag, "StoreError")
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
  assert.strictEqual(sqlite.prepare("SELECT price FROM prices_daily").get()?.price, 15000)
  assert.strictEqual(sqlite.prepare("SELECT checked_at FROM source_days").get()?.checked_at, "2026-10-19T00:00:00Z")
  assert.strictEqual(sqlite.prepare("SELECT COUNT(*) AS n FROM pihps_archive_events").get()?.n, 0)
}))

it.effect("empty, pending and failed checks never publish observation events", () => Effect.gen(function* () {
  const { db, sqlite } = yield* sqliteFixture
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    for (const status of ["pending", "empty", "error"] as const) yield* store.upsertDay(date, status, [], checkedAt)
  }).pipe(Effect.provide(d1PriceStoreLayer(db)))
  assert.strictEqual(sqlite.prepare("SELECT COUNT(*) AS n FROM pihps_archive_events").get()?.n, 0)
}))
