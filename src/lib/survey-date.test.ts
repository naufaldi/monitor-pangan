import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { SNAPSHOT_META } from "#/data/snapshot.gen.ts"
import { resolveSurveyDate } from "./survey-date.ts"

// Regression for issue #76: Sunday 2026-09-13 must show Friday 2026-09-11,
// the last trading day, not the nearer Monday 2026-09-14 survey.
it.effect("resolves a weekend pick to the last trading day with the real survey dates", () =>
  Effect.sync(() => {
    const dates = SNAPSHOT_META.liveDates
    assert.strictEqual(resolveSurveyDate(dates, "2026-09-13"), "2026-09-11")
    assert.strictEqual(resolveSurveyDate(dates, "2026-09-12"), "2026-09-11")
  }),
)

it.effect("keeps an available survey date unchanged", () =>
  Effect.sync(() => {
    const dates = SNAPSHOT_META.liveDates
    assert.strictEqual(resolveSurveyDate(dates, "2026-09-11"), "2026-09-11")
    assert.strictEqual(resolveSurveyDate(dates, "2026-09-14"), "2026-09-14")
    assert.strictEqual(resolveSurveyDate(dates, dates[0]!), dates[0]!)
    assert.strictEqual(resolveSurveyDate(dates, dates[dates.length - 1]!), dates[dates.length - 1]!)
  }),
)

it.effect("resolves a missing weekday inside a gap backward, never to the next survey", () =>
  Effect.sync(() => {
    const dates = ["2026-09-10", "2026-09-11", "2026-09-15"]
    assert.strictEqual(resolveSurveyDate(dates, "2026-09-14"), "2026-09-11")
    assert.strictEqual(resolveSurveyDate(dates, "2026-09-20"), "2026-09-15")
  }),
)

it.effect("returns null when no survey is at or before the pick, so the selection stays", () =>
  Effect.sync(() => {
    const dates = ["2026-09-10", "2026-09-11", "2026-09-15"]
    assert.strictEqual(resolveSurveyDate(dates, "2026-09-09"), null)
    assert.strictEqual(resolveSurveyDate(dates, "2017-01-01"), null)
    assert.strictEqual(resolveSurveyDate(dates, ""), null)
    assert.strictEqual(resolveSurveyDate(dates, "not-a-date"), null)
    assert.strictEqual(resolveSurveyDate(dates, "2026-02-30"), null)
    assert.strictEqual(resolveSurveyDate([], "2026-09-13"), null)
  }),
)