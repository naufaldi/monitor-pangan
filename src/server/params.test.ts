import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { parseSnapshotQuery, parseTrendQuery } from "./params.ts"

it.effect("accepts a well-formed snapshot query with defaults resolved", () =>
  Effect.gen(function*() {
    const query = yield* parseSnapshotQuery({ date: "2025-10-30", commodity: "beras" })
    assert.strictEqual(query.date, "2025-10-30")
    assert.strictEqual(query.commodity.id, "beras")
    assert.strictEqual(query.commodity.unit, "kg")
  }))

it.effect("rejects a malformed snapshot date with InvalidQueryError", () =>
  Effect.gen(function*() {
    const failure = yield* Effect.flip(parseSnapshotQuery({ date: "30/10/2025", commodity: "beras" }))
    assert.strictEqual(failure._tag, "InvalidQueryError")
  }))

it.effect("rejects an unknown snapshot commodity with UnknownCommodityError", () =>
  Effect.gen(function*() {
    const failure = yield* Effect.flip(parseSnapshotQuery({ date: "2025-10-30", commodity: "nope" }))
    assert.strictEqual(failure._tag, "UnknownCommodityError")
  }))

it.effect("accepts a trend query and normalizes region, cursor, and limit", () =>
  Effect.gen(function*() {
    const query = yield* parseTrendQuery({
      commodity: "cabai-merah",
      region: "",
      from: "2025-10-01",
      to: "2025-10-30",
    })
    assert.strictEqual(query.region, null)
    assert.strictEqual(query.cursor, null)
    assert.strictEqual(query.limit, 500)
    const paged = yield* parseTrendQuery({
      commodity: "cabai-merah",
      region: "32",
      from: "2025-10-01",
      to: "2025-10-30",
      cursor: "2025-10-15",
      limit: "50",
    })
    assert.strictEqual(paged.region, "32")
    assert.strictEqual(paged.cursor, "2025-10-15")
    assert.strictEqual(paged.limit, 50)
  }))

it.effect("rejects out-of-range trend limits and malformed regions", () =>
  Effect.gen(function*() {
    const tooBig = yield* Effect.flip(
      parseTrendQuery({ commodity: "beras", from: "2025-10-01", to: "2025-10-30", limit: "5000" }),
    )
    assert.strictEqual(tooBig._tag, "InvalidQueryError")
    const badRegion = yield* Effect.flip(
      parseTrendQuery({ commodity: "beras", region: "xx", from: "2025-10-01", to: "2025-10-30" }),
    )
    assert.strictEqual(badRegion._tag, "InvalidQueryError")
  }))
