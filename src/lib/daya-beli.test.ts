import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import {
  affordabilityEnds,
  affordabilityTier,
  buildAffordabilityRows,
  filterAffordability,
  kgPerWage,
  sortAffordability,
} from "./daya-beli.ts"

const provinces = [
  { code: "31", name: "Jakarta Raya" },
  { code: "32", name: "Jawa Barat" },
  { code: "93", name: "Papua Selatan" },
]

const wages = new Map([
  ["31", 5729876],
  ["32", 2317601],
  ["93", 4508100],
])

it.effect("floor-divides wage by price and nulls on missing inputs", () =>
  Effect.sync(() => {
    assert.strictEqual(kgPerWage(5729876, 13500), 424)
    assert.strictEqual(kgPerWage(2317601, 23000), 100)
    assert.strictEqual(kgPerWage(null, 13500), null)
    assert.strictEqual(kgPerWage(5729876, null), null)
    assert.strictEqual(kgPerWage(5729876, 0), null)
    assert.strictEqual(kgPerWage(0, 13500), null)
  }),
)

it.effect("ranks priced provinces and leaves gaps unranked in code order", () =>
  Effect.sync(() => {
    const rows = buildAffordabilityRows({
      provinces,
      wages,
      prices: new Map([
        ["31", 13500],
        ["32", 12000],
      ]),
      unit: "kg",
    })
    assert.strictEqual(rows.length, 3)
    assert.strictEqual(rows[0]?.regionCode, "31")
    assert.strictEqual(rows[0]?.rank, 1)
    assert.strictEqual(rows[1]?.regionCode, "32")
    assert.strictEqual(rows[1]?.rank, 2)
    const gap = rows[2]
    assert.strictEqual(gap?.regionCode, "93")
    assert.strictEqual(gap?.amount, null)
    assert.strictEqual(gap?.rank, null)
  }),
)

it.effect("sorting never moves gap rows and never ranks them", () =>
  Effect.sync(() => {
    const rows = buildAffordabilityRows({
      provinces,
      wages,
      prices: new Map([
        ["31", 13500],
        ["32", 12000],
      ]),
      unit: "kg",
    })
    for (const sort of ["amount-desc", "amount-asc", "name"] as const) {
      const sorted = sortAffordability(rows, sort)
      const tail = sorted[sorted.length - 1]
      assert.strictEqual(tail?.regionCode, "93")
      assert.strictEqual(tail?.rank, null)
    }
    const asc = sortAffordability(rows, "amount-asc")
    assert.strictEqual(asc[0]?.regionCode, "32")
  }),
)

it.effect("name filter keeps matching gaps unranked after priced rows", () =>
  Effect.sync(() => {
    const mixed = buildAffordabilityRows({
      provinces: [
        { code: "92", name: "Papua Barat" },
        { code: "31", name: "Jakarta Raya" },
        { code: "93", name: "Papua Tengah" },
        { code: "94", name: "Papua Selatan" },
      ],
      wages: new Map([
        ["92", 3841000],
        ["31", 5729876],
        ["93", 4508100],
        ["94", 4285848],
      ]),
      prices: new Map([
        ["92", 20000],
        ["31", 13500],
      ]),
      unit: "kg",
    })
    const filtered = filterAffordability(sortAffordability(mixed, "name"), "papua")
    assert.deepStrictEqual(
      filtered.map((row) => row.regionCode),
      ["92", "93", "94"],
    )
    assert.strictEqual(filtered[0]?.rank, 2)
    assert.strictEqual(filtered[1]?.rank, null)
    assert.strictEqual(filtered[2]?.rank, null)
    assert.strictEqual(filterAffordability(mixed, "   ").length, mixed.length)
    assert.strictEqual(filterAffordability(mixed, "tidak-ada").length, 0)
  }),
)

it.effect("splits priced ranks into five tiers and leaves gaps unranked", () =>
  Effect.sync(() => {
    assert.strictEqual(affordabilityTier(null, 5), "gap")
    assert.strictEqual(affordabilityTier(1, 0), "gap")
    assert.strictEqual(affordabilityTier(1, 5), "best")
    assert.strictEqual(affordabilityTier(2, 5), "high")
    assert.strictEqual(affordabilityTier(3, 5), "mid")
    assert.strictEqual(affordabilityTier(4, 5), "low")
    assert.strictEqual(affordabilityTier(5, 5), "worst")
    assert.strictEqual(affordabilityTier(1, 1), "best")
    assert.strictEqual(affordabilityTier(6, 5), "gap")
  }),
)

it.effect("picks highest and lowest priced rows and ignores gaps", () =>
  Effect.sync(() => {
    const rows = buildAffordabilityRows({
      provinces,
      wages,
      prices: new Map([
        ["31", 13500],
        ["32", 12000],
      ]),
      unit: "kg",
    })
    const ends = affordabilityEnds(rows)
    assert.strictEqual(ends.highest?.regionCode, "31")
    assert.strictEqual(ends.highest?.amount, 424)
    assert.strictEqual(ends.lowest?.regionCode, "32")
    const empty = affordabilityEnds(
      buildAffordabilityRows({
        provinces,
        wages,
        prices: new Map(),
        unit: "kg",
      }),
    )
    assert.strictEqual(empty.highest, null)
    assert.strictEqual(empty.lowest, null)
  }),
)
