import { Effect, Either, Schema } from "effect"
import { assert, it } from "@effect/vitest"
import { provider } from "./provider.ts"
import { UnknownCommodityError, UnknownDateError } from "./price-schema.ts"
import { decodeSnapshot, decodeTrendSeries } from "./price-schema.ts"
import { FreshPayloadSchema } from "./fresh-payload.ts"

it.effect("rejects invalid external fresh observations before overlay application", () =>
  Effect.gen(function*() {
    for (const price of [0, -100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = yield* Effect.either(Schema.decodeUnknown(FreshPayloadSchema)({
        latestDate: "2026-09-28",
        dates: ["2026-09-28"],
        prices: { "2026-09-28:beras:31": price },
      }))
      assert.ok(Either.isLeft(result))
    }
  }))

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

it.effect("decodes an empty snapshot without inventing a price", () =>
  Effect.gen(function*() {
    const decoded = yield* decodeSnapshot({
      ...provider.snapshot("2026-09-16", "beras"),
      nationalAvg: null,
      pricedCount: 0,
      rows: [{ regionCode: "31", price: null }],
    })
    assert.strictEqual(decoded.nationalAvg, null)
    assert.strictEqual(decoded.pricedCount, 0)
  }))

it.effect("rejects contradictory snapshot summaries", () =>
  Effect.gen(function*() {
    const base = provider.snapshot("2026-09-16", "beras")
    const contradictions = [
      { rows: [{ regionCode: "31", price: null }], nationalAvg: 0, pricedCount: 0 },
      { rows: [{ regionCode: "31", price: 16950 }], nationalAvg: null, pricedCount: 1 },
      { rows: [{ regionCode: "31", price: 16950 }], nationalAvg: 16950, pricedCount: 0 },
      { rows: [{ regionCode: "31", price: 16950 }], nationalAvg: 16950, pricedCount: 1.5 },
      { rows: [{ regionCode: "31", price: 16950 }], nationalAvg: 17000, pricedCount: 1 },
    ]
    for (const fields of contradictions) {
      const result = yield* Effect.either(decodeSnapshot({ ...base, ...fields }))
      assert.ok(Either.isLeft(result))
    }
  }))

it.effect("rejects non-finite zero and negative external prices", () =>
  Effect.gen(function*() {
    const base = provider.snapshot("2026-09-16", "beras")
    for (const price of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -100]) {
      const result = yield* Effect.either(decodeSnapshot({
        ...base,
        nationalAvg: 16950,
        pricedCount: 1,
        rows: [{ regionCode: "31", price }],
      }))
      assert.ok(Either.isLeft(result))
    }
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
  }))
