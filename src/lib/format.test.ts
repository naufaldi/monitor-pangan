import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { formatDateShort, formatMonthYear } from "./format.ts"

it.effect("formats a month bucket as Indonesian Mon YYYY for long-range axes", () =>
  Effect.sync(() => {
    assert.strictEqual(formatMonthYear("2020-03-01"), "Mar 2020")
    assert.strictEqual(formatMonthYear("2026-09-01"), "Sep 2026")
    assert.strictEqual(formatMonthYear("2017-05-01"), "Mei 2017")
    assert.strictEqual(formatDateShort("2026-09-16"), "16 Sep 2026")
  }),
)
