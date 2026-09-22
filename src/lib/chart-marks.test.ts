import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { axisInset, markPaint, plottedIndices, seriesMarks } from "./chart-marks.ts"
import { formatAxisPrice } from "./format.ts"

it.effect("classifies each node from the previous price and marks a missing date as a gap", () =>
  Effect.sync(() => {
    const dates = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"]
    const prices = new Map<string, number>([
      ["2026-08-17", 16200],
      ["2026-08-18", 16300],
      ["2026-08-20", 16200],
    ])
    assert.deepStrictEqual(seriesMarks(dates, prices), [
      { index: 0, date: "2026-08-17", kind: "flat", price: 16200 },
      { index: 1, date: "2026-08-18", kind: "up", price: 16300 },
      { index: 2, date: "2026-08-19", kind: "gap", price: null },
      { index: 3, date: "2026-08-20", kind: "down", price: 16200 },
    ])
  }),
)

it.effect("paints up, down, flat, and gap nodes differently", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(markPaint("up"), { fill: "#dc2626", stroke: "#dc2626" })
    assert.deepStrictEqual(markPaint("down"), { fill: "#00714c", stroke: "#00714c" })
    assert.deepStrictEqual(markPaint("flat"), { fill: "#ffffff", stroke: "#1a1c16" })
    assert.deepStrictEqual(markPaint("gap"), { fill: "#1a1c16", stroke: "#1a1c16" })
  }),
)

it.effect("draws every node when they have room and thins a dense series to ends, extrema, gaps, and the active node", () =>
  Effect.sync(() => {
    const roomy = seriesMarks(
      ["d0", "d1", "d2", "d3", "d4"],
      new Map([
        ["d0", 10],
        ["d1", 11],
        ["d2", 12],
        ["d3", 13],
        ["d4", 12],
      ]),
    )
    assert.deepStrictEqual(
      plottedIndices(roomy, (index) => index * 20, null),
      [0, 1, 2, 3, 4],
    )

    const dense = seriesMarks(
      ["d0", "d1", "d2", "d3", "d4", "d5"],
      new Map([
        ["d0", 10],
        ["d1", 11],
        ["d3", 12],
        ["d4", 13],
        ["d5", 11],
      ]),
    )
    assert.deepStrictEqual(plottedIndices(dense, (index) => index * 4, null), [0, 2, 4, 5])
    assert.deepStrictEqual(plottedIndices(dense, (index) => index * 4, 1), [0, 1, 2, 4, 5])
  }),
)

it.effect("formats axis prices as grouped rupiah that fit inside the chart inset", () =>
  Effect.sync(() => {
    assert.strictEqual(formatAxisPrice(16350), "16.350")
    assert.strictEqual(formatAxisPrice(16362.4), "16.362")
    const labels = ["16.350", "140.000"]
    const inset = axisInset(labels)
    for (const label of labels) {
      assert.ok(inset - 8 - label.length * 7 >= 0)
    }
  }),
)
