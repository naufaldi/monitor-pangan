import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { parsePihpsGrid } from "./pihps-grid.ts"

for (const [label, payload] of [
  ["missing data", {}],
  ["error envelope", { error: "upstream unavailable" }],
  ["null data", { data: null }],
  ["non-array data", { data: {} }],
  ["malformed row", { data: [{ name: "Beras" }] }],
] as const) {
  it.effect(`rejects ${label} as a typed decode failure`, () => Effect.gen(function* () {
    const failure = yield* Effect.flip(parsePihpsGrid("2026-10-19", "31", payload))
    assert.strictEqual(failure._tag, "PihpsDecodeError")
  }))
}

for (const [label, price] of [
  ["zero", 0], ["negative", -100], ["string zero", "0"], ["string negative", "-100"],
  ["NaN", Number.NaN], ["infinity", Number.POSITIVE_INFINITY],
  ["negative infinity", Number.NEGATIVE_INFINITY], ["string infinity", "Infinity"],
  ["nonnumeric string", "upstream unavailable"],
] as const) {
  it.effect(`rejects a ${label} observation instead of completing an empty grid`, () => Effect.gen(function* () {
    const failure = yield* Effect.flip(parsePihpsGrid("2026-10-19", "31", {
      data: [{ name: "Beras", level: 1, "19/10/2026": price }],
    }))
    assert.strictEqual(failure._tag, "PihpsDecodeError")
  }))
}

it.effect("retains valid empty grids and documented missing cells as absence", () => Effect.gen(function* () {
  assert.deepStrictEqual(yield* parsePihpsGrid("2026-10-19", "31", { data: [] }), [])
  for (const missing of [null, "", "  ", "-", " - "]) {
    assert.deepStrictEqual(yield* parsePihpsGrid("2026-10-19", "31", {
      data: [{ name: "Beras", level: 1, "19/10/2026": missing }],
    }), [])
  }
  assert.deepStrictEqual(yield* parsePihpsGrid("2026-10-19", "31", {
    data: [{ name: "Beras", level: 1, "16/10/2026": "16,000" }],
  }), [])
}))

it.effect("keeps PIHPS number formatting and ignores other dates, levels and commodities", () => Effect.gen(function* () {
  const cells = yield* parsePihpsGrid("2026-10-19", "31", {
    data: [
      { name: "Beras", level: 1, "19/10/2026": "16,950", "16/10/2026": "bad" },
      { name: "Gula Pasir", level: 1, "19/10/2026": "19.950" },
      { name: "Daging Ayam", level: 1, "19/10/2026": 41700 },
      { name: "Beras Kualitas Bawah", level: 2, "19/10/2026": "bad" },
      { name: "Unknown", level: 1, "19/10/2026": "bad" },
    ],
  })
  assert.deepStrictEqual(cells, [
    { date: "2026-10-19", commodityId: "beras", regionCode: "31", price: 16950 },
    { date: "2026-10-19", commodityId: "gula-pasir", regionCode: "31", price: 19950 },
    { date: "2026-10-19", commodityId: "daging-ayam", regionCode: "31", price: 41700 },
  ])
}))
