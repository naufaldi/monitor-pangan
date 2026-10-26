import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { COMMODITIES } from "#/data/catalog.ts"
import type { Snapshot } from "#/data/provider.ts"
import { cachedOverview, type OverviewReader } from "./province-overview.ts"
import { calculateBasket, parseQuantity } from "./basket.ts"

const date = "2026-09-16"
const previous = "2026-09-15"
function overview(price: number | null = 15000, previousPrice: number | null = 14000) {
  const reader: OverviewReader = {
    cached: (day, id): Snapshot => ({
      date: day, commodity: COMMODITIES.find((item) => item.id === id)!, nationalAvg: 20000,
      pricedCount: 1, rows: [{ regionCode: "31", price: day === date ? price : previousPrice }, { regionCode: "95", price: null }],
    }),
    load: () => Effect.die("Fixture must be cached"),
  }
  return cachedOverview(date, previous, reader)
}

it.effect("parses bounded decimal quantities without grouping, signs, exponents, or silent rounding", () => Effect.sync(() => {
  for (const [input, hundredths] of [["", 0], ["  ", 0], ["0", 0], ["0,25", 25], [" 2.50 ", 250], ["1000", 100000]] as const) {
    assert.deepStrictEqual(parseQuantity(input), { valid: true, hundredths })
  }
  for (const input of ["-1", "+1", "1000.01", "1e2", "NaN", "Infinity", "1,000", "1.000", "1,2.3", "0.001", "rice", "1."]) {
    assert.strictEqual(parseQuantity(input).valid, false, input)
  }
}))

it.effect("uses the same quantities and province on both dates and sums rounded displayed line costs", () => Effect.sync(() => {
  const result = calculateBasket(overview(), "31", { beras: "2", "minyak-goreng": "0,5" }, true)
  assert.deepStrictEqual(result.current, { status: "complete", total: 37500 })
  assert.deepStrictEqual(result.previous, { status: "complete", total: 35000 })
  assert.strictEqual(result.changeRp, 2500)
  assert.strictEqual(result.changePct, 2500 / 35000 * 100)
  assert.strictEqual(result.lines.find((line) => line.commodity.id === "minyak-goreng")?.commodity.unit, "liter")
  const rounded = calculateBasket(overview(101, 99), "31", { beras: "0.5", "telur-ayam": "0.5" }, true)
  assert.deepStrictEqual(rounded.current, { status: "complete", total: 102 })
  assert.deepStrictEqual(rounded.previous, { status: "complete", total: 100 })
}))

it.effect("distinguishes empty, invalid and incomplete instead of turning gaps into zero", () => Effect.sync(() => {
  assert.strictEqual(calculateBasket(overview(), "31", { beras: "0" }, true).current.status, "empty")
  assert.strictEqual(calculateBasket(overview(), "31", { beras: "2", "telur-ayam": "-1" }, true).current.status, "invalid")
  assert.strictEqual(calculateBasket(overview(), "31", { unknown: "1" }, true).current.status, "invalid")
  const missing = calculateBasket(overview(), "95", { beras: "2" }, true)
  assert.strictEqual(missing.current.status, "incomplete")
  assert.strictEqual(missing.changePct, null)
  const noComparison = calculateBasket(overview(15000, null), "31", { beras: "2" }, true)
  assert.deepStrictEqual(noComparison.current, { status: "complete", total: 30000 })
  assert.strictEqual(noComparison.previous.status, "incomplete")
  assert.strictEqual(noComparison.changeRp, null)
}))

it.effect("rejects sample prices, wrong dates, failures and nonfinite prices without national fallback", () => Effect.sync(() => {
  assert.strictEqual(calculateBasket(overview(), "31", { beras: "1" }, false).current.status, "incomplete")
  const sampleComparison = calculateBasket(overview(), "31", { beras: "1" }, true, false)
  assert.strictEqual(sampleComparison.current.status, "complete")
  assert.strictEqual(sampleComparison.previous.status, "incomplete")
  assert.strictEqual(sampleComparison.changePct, null)
  const wrongDate = overview()
  const first = wrongDate.entries[0]!.current
  assert.ok(first.status === "ready")
  wrongDate.entries[0]!.current = { status: "ready", snapshot: { ...first.snapshot, date: previous } }
  assert.strictEqual(calculateBasket(wrongDate, "31", { beras: "1" }, true).current.status, "incomplete")
  const failure = overview()
  failure.entries[0]!.current = { status: "error", kind: "request" }
  assert.strictEqual(calculateBasket(failure, "31", { beras: "1" }, true).current.status, "incomplete")
  for (const price of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    assert.strictEqual(calculateBasket(overview(price), "31", { beras: "1000" }, true).current.status, "incomplete")
  }
}))
