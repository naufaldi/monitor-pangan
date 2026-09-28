import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { isTradingDay, mondayOf, monthBucket, nextIsoDay, tradingDaysFromThrough } from "./civil-date.ts"

it.effect("week and month buckets match the PIHPS calendar", () =>
  Effect.sync(() => {
    assert.strictEqual(mondayOf("2026-09-28"), "2026-09-28")
    assert.strictEqual(mondayOf("2026-09-25"), "2026-09-21")
    assert.strictEqual(mondayOf("2026-09-16"), "2026-09-14")
    assert.strictEqual(mondayOf("2026-09-01"), "2026-08-31")
    assert.strictEqual(monthBucket("2026-09-28"), "2026-09-01")
    assert.strictEqual(nextIsoDay("2026-09-16"), "2026-09-17")
    assert.strictEqual(isTradingDay("2026-09-28"), true)
    assert.strictEqual(isTradingDay("2026-09-26"), false)
    assert.strictEqual(isTradingDay("2026-09-27"), false)
    assert.deepStrictEqual(tradingDaysFromThrough("2026-09-25", "2026-09-28"), [
      "2026-09-25",
      "2026-09-28",
    ])
    assert.deepStrictEqual(tradingDaysFromThrough("2026-09-17", "2026-09-18"), [
      "2026-09-17",
      "2026-09-18",
    ])
  }),
)
