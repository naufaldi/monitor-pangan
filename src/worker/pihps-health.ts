import { DateTime, Effect, Schema } from "effect"
import { STATIC_LIVE_THROUGH } from "../data/fresh-prices.ts"
import { CivilDateSchema } from "../data/price-schema.ts"
import { nextIsoDay, isTradingDay } from "../lib/civil-date.ts"
import { IsoTimestampSchema, PihpsHealthReadStore } from "./price-store.ts"

export const PihpsHealthSchema = Schema.Struct({
  status: Schema.Literal("ok", "waiting", "degraded", "unavailable"),
  checkedAt: IsoTimestampSchema,
  latestCheckedDate: Schema.NullOr(CivilDateSchema),
  latestPricedDate: Schema.NullOr(CivilDateSchema),
  oldestUnresolvedDate: Schema.NullOr(CivilDateSchema),
  lastAttemptAt: Schema.NullOr(IsoTimestampSchema),
  lastAttemptOutcome: Schema.NullOr(Schema.Literal("complete", "error")),
  lastSuccessfulRunAt: Schema.NullOr(IsoTimestampSchema),
})

const JAKARTA = DateTime.zoneUnsafeMakeNamed("Asia/Jakarta")

/** Coverage is daily evidence; job success is independent evidence of invocation completion. */
export const pihpsHealth = Effect.fn("Pihps.health")(function* () {
  const now = yield* DateTime.now
  const checkedAt = DateTime.formatIso(now)
  const local = DateTime.setZone(now, JAKARTA)
  const today = DateTime.formatIsoDate(local)
  const parts = DateTime.toParts(local)
  const beforeDeadline = parts.hours * 60 + parts.minutes < 17 * 60 + 45
  const store = yield* PihpsHealthReadStore
  const report = yield* store.evidence(STATIC_LIVE_THROUGH, today).pipe(Effect.map((evidence) => {
    const completed = evidence.coverage.filter((day) => day.status === "live" || day.status === "empty")
    const finalized = new Set(completed.map((day) => day.date))
    let oldestUnresolvedDate: string | null = null
    for (let date = nextIsoDay(STATIC_LIVE_THROUGH); date <= today; date = nextIsoDay(date)) {
      if (isTradingDay(date) && !finalized.has(date)) { oldestUnresolvedDate = date; break }
      if (date === today) break
    }
    const attempt = evidence.attempts[0]
    const success = evidence.successes[0]
    const lastAttemptOutcome = attempt == null ? null : attempt.status === "complete" ? "complete" as const : "error" as const
    const invocationHealthy = success != null && lastAttemptOutcome === "complete"
    const status = !invocationHealthy ? "degraded" : oldestUnresolvedDate == null ? "ok"
      : oldestUnresolvedDate === today && beforeDeadline ? "waiting" : "degraded"
    return { status, checkedAt, latestCheckedDate: completed.at(-1)?.date ?? null, latestPricedDate: evidence.latestPricedDate,
      oldestUnresolvedDate, lastAttemptAt: attempt?.started_at ?? null, lastAttemptOutcome, lastSuccessfulRunAt: success?.started_at ?? null }
  }), Effect.flatMap(Schema.decodeUnknown(PihpsHealthSchema)), Effect.catchAll(() => Effect.logError({ event: "pihps_health_unavailable" }).pipe(Effect.as({
    status: "unavailable" as const, checkedAt, latestCheckedDate: null, latestPricedDate: null, oldestUnresolvedDate: null,
    lastAttemptAt: null, lastAttemptOutcome: null, lastSuccessfulRunAt: null,
  }))))
  return Response.json(report, { status: report.status === "unavailable" || report.status === "degraded" ? 503 : 200, headers: { "cache-control": "no-store" } })
})
