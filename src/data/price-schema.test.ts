import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { provider } from "./provider.ts"
import { SnapshotSchema, TrendSeriesSchema, UnknownCommodityError, UnknownDateError } from "./price-schema.ts"
import { decodeSnapshot, decodeTrendSeries } from "./price-schema.ts"

it.effect("decodes a live provider snapshot", () =>
  Effect.gen(function*() {
    const snapshot = provider.snapshot("2026-09-16", "beras")
    const decoded = yield* decodeSnapshot(snapshot)
    assert.strictEqual(decoded.nationalAvg, snapshot.nationalAvg)
    assert.strictEqual(decoded.rows.length, snapshot.rows.length)
  }))

it.effect("decodes a provider trend series", () =>
  Effect.gen(function*() {
    const series = provider.trend("beras", "31")
    const decoded = yield* decodeTrendSeries(series)
    assert.strictEqual(decoded.national.length, series.national.length)
    assert.strictEqual(decoded.direction, series.direction)
  }))

it.effect("rejects a malformed snapshot with a ParseError", () =>
  Effect.gen(function*() {
    const failure = yield* Effect.flip(decodeSnapshot({ date: 42, commodity: null }))
    assert.strictEqual(failure._tag, "ParseError")
  }))

it.effect("rejects a trend series with an unknown direction", () =>
  Effect.gen(function*() {
    const series = provider.trend("beras")
    const failure = yield* Effect.flip(
      decodeTrendSeries({ ...series, direction: "sideways" })
    )
    assert.strictEqual(failure._tag, "ParseError")
  }))

it.effect("exposes typed domain errors", () =>
  Effect.gen(function*() {
    const commodity = new UnknownCommodityError({ commodityId: "nope" })
    const date = new UnknownDateError({ date: "1900-01-01" })
    assert.strictEqual(commodity._tag, "UnknownCommodityError")
    assert.strictEqual(date._tag, "UnknownDateError")
    assert.strictEqual(SnapshotSchema.ast._tag, "TypeLiteral")
    assert.strictEqual(TrendSeriesSchema.ast._tag, "TypeLiteral")
  }))
