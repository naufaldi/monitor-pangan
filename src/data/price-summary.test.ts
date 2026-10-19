import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { summarizePrices } from "./price-summary.ts"

it.effect("an empty set has no national price", () => Effect.sync(() => {
  assert.deepStrictEqual(summarizePrices([{ regionCode: "31", price: null }]), {
    nationalAvg: null,
    pricedCount: 0,
  })
  assert.deepStrictEqual(summarizePrices([]), { nationalAvg: null, pricedCount: 0 })
}))

it.effect("one observation retains Rp50 rounding", () => Effect.sync(() => {
  assert.deepStrictEqual(summarizePrices([{ regionCode: "31", price: 16930 }]), {
    nationalAvg: 16950,
    pricedCount: 1,
  })
}))

it.effect("partial coverage averages only finite positive observations", () => Effect.sync(() => {
  assert.deepStrictEqual(summarizePrices([
    { regionCode: "31", price: 16000 },
    { regionCode: "32", price: 17100 },
    { regionCode: "33", price: null },
    { regionCode: "34", price: Number.NaN },
    { regionCode: "35", price: Number.POSITIVE_INFINITY },
    { regionCode: "36", price: 0 },
    { regionCode: "51", price: -100 },
  ]), { nationalAvg: 16550, pricedCount: 2 })
}))
