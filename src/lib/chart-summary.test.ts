import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import {
  chartHighlights,
  chartStrip,
  limitedProvinceCopy,
  realPoints,
} from "./chart-summary.ts"
import type { TrendPoint } from "#/data/provider.ts"

const pts = (rows: Array<[string, number]>): TrendPoint[] =>
  rows.map(([date, price]) => ({ date, price }))

it.effect("drops non-positive prices instead of treating them as extrema", () =>
  Effect.sync(() => {
    const points = pts([
      ["2026-09-14", 0],
      ["2026-09-15", 10000],
      ["2026-09-16", 12000],
    ])
    assert.deepStrictEqual(realPoints(points), pts([
      ["2026-09-15", 10000],
      ["2026-09-16", 12000],
    ]))
  }),
)

it.effect("hides strip numbers when there are no real points", () =>
  Effect.sync(() => {
    const strip = chartStrip([])
    assert.strictEqual(strip.kind, "empty")
    assert.strictEqual(strip.sekarang, null)
    assert.strictEqual(strip.delta, null)
    assert.strictEqual(strip.termurah, null)
    assert.strictEqual(strip.termahal, null)
  }),
)

it.effect("shows Sekarang only for a single real point and hides delta extrema", () =>
  Effect.sync(() => {
    const strip = chartStrip(pts([["2026-09-16", 13500]]))
    assert.strictEqual(strip.kind, "single")
    assert.deepStrictEqual(strip.sekarang, { date: "2026-09-16", price: 13500 })
    assert.strictEqual(strip.delta, null)
    assert.strictEqual(strip.termurah, null)
    assert.strictEqual(strip.termahal, null)
  }),
)

it.effect("computes delta min and max from first last and extrema real points", () =>
  Effect.sync(() => {
    const strip = chartStrip(
      pts([
        ["2026-09-10", 10000],
        ["2026-09-11", 8000],
        ["2026-09-15", 15000],
        ["2026-09-16", 12000],
      ]),
    )
    assert.strictEqual(strip.kind, "range")
    assert.deepStrictEqual(strip.sekarang, { date: "2026-09-16", price: 12000 })
    assert.deepStrictEqual(strip.termurah, { date: "2026-09-11", price: 8000 })
    assert.deepStrictEqual(strip.termahal, { date: "2026-09-15", price: 15000 })
    assert.strictEqual(strip.delta?.rp, 2000)
    assert.strictEqual(strip.delta?.pct, 20)
    assert.strictEqual(strip.delta?.direction, "up")
  }),
)

it.effect("picks biggest up down and last consecutive real-point moves", () =>
  Effect.sync(() => {
    const highlights = chartHighlights(
      pts([
        ["2026-09-10", 10000],
        ["2026-09-11", 11000],
        ["2026-09-12", 8000],
        ["2026-09-16", 9000],
      ]),
    )
    assert.strictEqual(highlights.naikTerbesar?.to.date, "2026-09-16")
    assert.strictEqual(highlights.naikTerbesar?.pct, 12.5)
    assert.strictEqual(highlights.turunTerbesar?.to.date, "2026-09-12")
    assert.strictEqual(highlights.turunTerbesar?.rp, -3000)
    assert.strictEqual(highlights.terakhir?.to.date, "2026-09-16")
    assert.strictEqual(highlights.terakhir?.rp, 1000)
  }),
)

it.effect("names a thin province without inventing a zero price", () =>
  Effect.sync(() => {
    assert.strictEqual(
      limitedProvinceCopy("Papua"),
      "Data di Papua masih terbatas",
    )
  }),
)
