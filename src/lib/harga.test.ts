import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import {
  meanRupiah,
  nationalChange,
  previousDateWithHarga,
  previousTradingDate,
  provinceChange,
  yearAgoDate,
} from "./harga.ts"

it.effect("rounds the mean to the nearest rupiah and ignores an empty set", () =>
  Effect.sync(() => {
    assert.strictEqual(meanRupiah([]), null)
    assert.strictEqual(meanRupiah([16950, 15200]), 16075)
    assert.strictEqual(meanRupiah([10, 11]), 11)
  }),
)

it.effect("picks the previous trading day and the year-ago anchor", () =>
  Effect.sync(() => {
    const dates = ["2025-09-15", "2025-09-16", "2026-09-15", "2026-09-16"]
    assert.strictEqual(previousTradingDate(dates, "2026-09-16"), "2026-09-15")
    assert.strictEqual(previousTradingDate(dates, "2025-09-15"), null)
    assert.strictEqual(yearAgoDate(dates, "2026-09-16"), "2025-09-16")
    assert.strictEqual(yearAgoDate(dates, "2026-09-17"), "2025-09-16")
    assert.strictEqual(yearAgoDate(["2026-09-16"], "2026-09-16"), null)
    assert.strictEqual(yearAgoDate(["2023-02-28", "2024-02-29"], "2024-02-29"), "2023-02-28")
    assert.strictEqual(
      previousDateWithHarga(dates, "2026-09-16", (date) => date !== "2026-09-15"),
      "2025-09-16",
    )
  }),
)

it.effect("leaves a province change empty when either day has no harga", () =>
  Effect.sync(() => {
    assert.strictEqual(provinceChange(16950, null, "2026-09-15"), null)
    assert.strictEqual(provinceChange(null, 16950, "2026-09-15"), null)
    const change = provinceChange(16950, 15000, "2025-09-16")
    assert.strictEqual(change?.anchorDate, "2025-09-16")
    assert.strictEqual(change?.pct, ((16950 - 15000) / 15000) * 100)
    assert.strictEqual(change?.overlap, 1)
  }),
)

it.effect("national change uses only provinces priced on both days", () =>
  Effect.sync(() => {
    const today = new Map<string, number | null>([
      ["31", 200],
      ["32", 100],
      ["21", null],
    ])
    const anchor = new Map<string, number | null>([
      ["31", 100],
      ["32", null],
      ["21", 50],
    ])
    const change = nationalChange(today, anchor, "2025-09-16")
    assert.strictEqual(change?.overlap, 1)
    assert.strictEqual(change?.surveyed, 2)
    assert.strictEqual(change?.pct, 100)
    assert.strictEqual(nationalChange(new Map([["21", null]]), anchor, "2025-09-16"), null)
  }),
)
