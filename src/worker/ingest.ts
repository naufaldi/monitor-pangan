import { Cause, Context, Data, DateTime, Effect, Exit, Layer, Option } from "effect"
import { BI_TO_KEMENDAGRI } from "../data/pihps-catalog.ts"
import type { FreshPayload } from "../data/fresh-payload.ts"
import { STATIC_LIVE_THROUGH } from "../data/fresh-prices.ts"
import { parsePihpsGrid, type PihpsDecodeError, type PihpsPriceCell } from "../data/pihps-grid.ts"
import { classifySuccessfulDay, planIngestDate, type CoverageDay } from "./ingest-plan.ts"
import { todayInJakarta } from "../lib/jakarta-today.ts"

export class PihpsFetchError extends Data.TaggedError("PihpsFetchError")<{
  readonly message: string
}> {}

export class StoreError extends Data.TaggedError("StoreError")<{
  readonly message: string
  readonly rowsUpserted?: number
}> {}

export type IngestError = PihpsFetchError | PihpsDecodeError | StoreError

export type JobRecord = {
  readonly startedAt: string
  readonly status: "complete" | "error"
  readonly rowsUpserted: number
  readonly note: string
}

export class PihpsSource extends Context.Tag("PihpsSource")<
  PihpsSource,
  {
    readonly fetchGrid: (date: string, provinceId: string) => Effect.Effect<unknown, PihpsFetchError>
  }
>() {}

export class PriceStore extends Context.Tag("PriceStore")<
  PriceStore,
  {
    readonly coverageSince: (after: string) => Effect.Effect<readonly CoverageDay[], StoreError>
    readonly upsertDay: (
      date: string,
      status: CoverageDay["status"],
      rows: readonly PihpsPriceCell[],
      checkedAt: string,
    ) => Effect.Effect<number, StoreError>
    readonly recordJob: (job: JobRecord) => Effect.Effect<void, StoreError>
    readonly freshSince: (after: string) => Effect.Effect<FreshPayload, StoreError>
  }
>() {}

const PIHPS_HEADERS = {
  "User-Agent": "Mozilla/5.0 monitor-pangan/0.1.0",
  Referer: "https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah",
  Accept: "application/json",
}

/** Live PIHPS grid. One province, one civil day. */
export const PihpsHttpLive = Layer.succeed(PihpsSource, {
  fetchGrid: (date, provinceId) =>
    Effect.tryPromise({
      try: () => {
        const url = new URL("https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah")
        url.searchParams.set("price_type_id", "1")
        url.searchParams.set("tipe_laporan", "1")
        url.searchParams.set("start_date", date)
        url.searchParams.set("end_date", date)
        url.searchParams.set("province_id", provinceId)
        return fetch(url, { headers: PIHPS_HEADERS }).then((res) => {
          if (!res.ok) return Promise.reject(new Error(`HTTP ${res.status}`))
          return res.json()
        })
      },
      catch: (cause) => new PihpsFetchError({ message: String(cause) }),
    }),
})

export type IngestResult = {
  readonly dates: readonly string[]
  readonly rowsUpserted: number
}

/** One selected survey day: 34 provincial requests, concurrency five, no immediate retry. */
export const ingestRecent = Effect.fn("Pihps.ingestRecent")(function* (maxDays: number) {
  const source = yield* PihpsSource
  const store = yield* PriceStore
  const today = yield* todayInJakarta()
  const startedAt = DateTime.formatIso(yield* DateTime.now)
  let target: string | null = null
  let rowsUpserted = 0
  const outcome = yield* Effect.exit(Effect.gen(function* () {
    const coverage = yield* store.coverageSince(STATIC_LIVE_THROUGH)
    target = maxDays > 0 ? planIngestDate(today, STATIC_LIVE_THROUGH, coverage) : null
    if (target == null) return { dates: [], rowsUpserted: 0 } satisfies IngestResult
    const date = target
    const batches = yield* Effect.forEach(
      Object.entries(BI_TO_KEMENDAGRI),
      ([provinceId, regionCode]) => Effect.gen(function* () {
        const json = yield* source.fetchGrid(date, provinceId)
        return yield* parsePihpsGrid(date, regionCode, json)
      }),
      { concurrency: 5 },
    )
    const rows = batches.flat()
    rowsUpserted = yield* store.upsertDay(date, classifySuccessfulDay(date, today, rows.length), rows, startedAt).pipe(
      Effect.tapError((error) => Effect.sync(() => { rowsUpserted = error.rowsUpserted ?? 0 })),
    )
    return { dates: [date], rowsUpserted } satisfies IngestResult
  }))
  const failure = Exit.isFailure(outcome) ? Option.getOrNull(Cause.failureOption(outcome.cause)) : null
  const category = Exit.isSuccess(outcome) ? "complete" : failure?._tag ?? "Defect"
  const details = { event: "pihps_ingest", targetDate: target, category, rowsUpserted }
  if (Exit.isFailure(outcome)) {
    yield* Effect.logError(details)
    if (target != null) yield* store.upsertDay(target, "error", [], startedAt).pipe(
      Effect.catchAllCause(() => Effect.logError({ ...details, event: "pihps_day_record_failed", originalCategory: category, category: "StoreError" })),
    )
  }
  const recorded = yield* Effect.exit(store.recordJob({
    startedAt,
    status: Exit.isSuccess(outcome) ? "complete" : "error",
    rowsUpserted,
    note: `target=${target ?? "none"} category=${category}`,
  }))
  if (Exit.isFailure(recorded)) {
    yield* Effect.logError({ ...details, event: "pihps_job_record_failed", originalCategory: category, category: "StoreError" })
  }
  if (Exit.isFailure(outcome)) return yield* Effect.failCause(outcome.cause)
  if (Exit.isFailure(recorded)) return yield* Effect.failCause(recorded.cause)
  return outcome.value
})
