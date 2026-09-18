import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import {
  DEFAULT_TIMEFRAME,
  TIMEFRAMES,
  timeframeById,
  windowRange,
} from "./chart-window.ts"

it.effect("exposes Indonesian chip labels without 3H and defaults to Semua", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(
      TIMEFRAMES.map((t) => t.label),
      ["7 hari", "1 bulan", "1 tahun", "Semua"],
    )
    assert.strictEqual(DEFAULT_TIMEFRAME, "all")
    assert.strictEqual(timeframeById("1y")?.days, 365)
    assert.strictEqual(timeframeById("7d")?.resolution, "day")
    assert.strictEqual(timeframeById("1m")?.resolution, "day")
    assert.strictEqual(timeframeById("1y")?.resolution, "week")
    assert.strictEqual(timeframeById("all")?.resolution, "month")
  }),
)

it.effect("windows the last N live dates without inventing extra days", () =>
  Effect.sync(() => {
    const dates = ["2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16"]
    assert.deepStrictEqual(windowRange(dates, 3), { from: "2026-09-14", to: "2026-09-16" })
    assert.deepStrictEqual(windowRange(dates, Number.MAX_SAFE_INTEGER), {
      from: "2026-09-10",
      to: "2026-09-16",
    })
    assert.deepStrictEqual(windowRange([], 7), { from: "", to: "" })
  }),
)
