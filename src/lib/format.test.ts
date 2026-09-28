import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { formatDateLong, formatDateShort, formatMonthYear, formatSeriesDate } from "./format.ts"

it.effect("formats a month bucket as Indonesian Mon YYYY for long-range axes", () =>
  Effect.sync(() => {
    assert.strictEqual(formatMonthYear("2020-03-01"), "Mar 2020")
    assert.strictEqual(formatMonthYear("2026-09-01"), "Sep 2026")
    assert.strictEqual(formatMonthYear("2017-05-01"), "Mei 2017")
    assert.strictEqual(formatDateShort("2026-09-16"), "16 Sep 2026")
    assert.strictEqual(formatDateLong("2026-09-16"), "16 September 2026")
    assert.strictEqual(formatDateLong("2026-09-01"), "1 September 2026")
    assert.strictEqual(formatSeriesDate("2026-09-01", "month"), "Sep 2026")
    assert.notStrictEqual(formatSeriesDate("2026-09-01", "month"), "1 Sep 2026")
    assert.strictEqual(formatSeriesDate("2026-09-28", "day"), "28 Sep 2026")
    assert.strictEqual(formatSeriesDate("2026-09-14", "week"), "14 Sep 2026")
  }),
)
