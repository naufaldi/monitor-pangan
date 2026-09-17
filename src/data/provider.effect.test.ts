import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { provider } from "./provider.ts"
import { PriceDataService, getDates, getProvinces, getSnapshot, getTrend } from "./provider.effect.ts"

const Live = PriceDataService.Live

it.effect("dates output matches the provider", () =>
  Effect.gen(function*() {
    const viaEffect = yield* getDates().pipe(Effect.provide(Live))
    assert.deepStrictEqual(viaEffect, provider.dates())
  }))

it.effect("provinces output matches the provider", () =>
  Effect.gen(function*() {
    const viaEffect = yield* getProvinces().pipe(Effect.provide(Live))
    assert.deepStrictEqual(viaEffect, provider.provinces())
  }))

it.effect("snapshot output matches the provider", () =>
  Effect.gen(function*() {
    const viaEffect = yield* getSnapshot("2026-09-16", "beras").pipe(Effect.provide(Live))
    assert.deepStrictEqual(viaEffect, provider.snapshot("2026-09-16", "beras"))
  }))

it.effect("trend output matches the provider across resolutions", () =>
  Effect.gen(function*() {
    for (const resolution of ["day", "week", "month"] as const) {
      const range = { resolution } as const
      const viaEffect = yield* getTrend("cabai-merah", "32", range).pipe(Effect.provide(Live))
      assert.deepStrictEqual(viaEffect, provider.trend("cabai-merah", "32", range))
    }
    const national = yield* getTrend("beras").pipe(Effect.provide(Live))
    assert.deepStrictEqual(national, provider.trend("beras"))
  }))

it.effect("snapshot fails typed on unknown date", () =>
  Effect.gen(function*() {
    const failure = yield* Effect.flip(getSnapshot("1900-01-01", "beras").pipe(Effect.provide(Live)))
    assert.strictEqual(failure._tag, "UnknownDateError")
  }))

it.effect("snapshot and trend fail typed on unknown commodity", () =>
  Effect.gen(function*() {
    const snapshotFailure = yield* Effect.flip(
      getSnapshot("2026-09-16", "nope").pipe(Effect.provide(Live))
    )
    assert.strictEqual(snapshotFailure._tag, "UnknownCommodityError")
    const trendFailure = yield* Effect.flip(getTrend("nope").pipe(Effect.provide(Live)))
    assert.strictEqual(trendFailure._tag, "UnknownCommodityError")
  }))
