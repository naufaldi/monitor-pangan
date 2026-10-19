import { nextIsoDay, tradingDaysFromThrough } from "../lib/civil-date.ts"
import { Schema } from "effect"
import { CivilDateSchema } from "../data/price-schema.ts"
export const CoverageDaySchema = Schema.Struct({ date: CivilDateSchema, status: Schema.Literal("live", "empty", "pending", "error") })
export type CoverageDay = typeof CoverageDaySchema.Type
/** Earliest unresolved weekday wins; today's completed survey remains refreshable. */
export const planIngestDate = (today: string, staticThrough: string, days: readonly CoverageDay[]): string | null => {
  const completed = new Set(days.filter((day) => day.status === "live" || day.status === "empty").map((day) => day.date))
  const eligible = tradingDaysFromThrough(nextIsoDay(staticThrough), today)
  return eligible.find((date) => !completed.has(date)) ?? (eligible.includes(today) ? today : null)
}
export const classifySuccessfulDay = (date: string, today: string, pricedCount: number): "live" | "pending" | "empty" =>
  pricedCount > 0 ? "live" : date === today ? "pending" : "empty"
