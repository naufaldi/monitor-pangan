import { Schema } from "effect"
import { CivilDateSchema } from "#/data/price-schema.ts"

/**
 * Last-trading-day rule (CONTEXT.md): a picked date resolves to the latest
 * available survey at or before it, never to a later survey. `dates` must be
 * sorted ascending; validated civil dates compare chronologically as strings.
 * Returns null when no survey is at or before the pick (invalid input or a
 * date before the earliest survey) so callers keep their current valid
 * selection instead of substituting a future observation.
 */
export function resolveSurveyDate(dates: readonly string[], target: string): string | null {
  if (!Schema.is(CivilDateSchema)(target)) return null
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i]!
    if (date <= target) return date
  }
  return null
}