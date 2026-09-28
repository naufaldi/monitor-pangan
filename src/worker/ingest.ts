import { Context, Data, DateTime, Effect, Layer } from "effect"
import { BI_TO_KEMENDAGRI } from "../data/pihps-catalog.ts"
import type { FreshPayload } from "../data/fresh-payload.ts"
import { STATIC_LIVE_THROUGH } from "../data/fresh-prices.ts"
import { parsePihpsGrid, type PihpsDecodeError, type PihpsPriceCell } from "../data/pihps-grid.ts"
import { nextIsoDay, tradingDaysFromThrough } from "../lib/civil-date.ts"

export class PihpsFetchError extends Data.TaggedError("PihpsFetchError")<{
  readonly message: string
}> {}

export class StoreError extends Data.TaggedError("StoreError")<{
  readonly message: string
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
    readonly latestCheckedDate: Effect.Effect<string | null, StoreError>
    readonly upsertDay: (
      date: string,
      status: "live" | "empty",
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

const JAKARTA = DateTime.zoneUnsafeMakeNamed("Asia/Jakarta")

/** Civil today in Jakarta, where PIHPS publishes. */
const todayInJakarta = Effect.fn("Pihps.today")(function* () {
  const now = yield* DateTime.now
  return DateTime.formatIsoDate(DateTime.setZone(now, JAKARTA))
})

export type IngestResult = {
  readonly dates: readonly string[]
  readonly rowsUpserted: number
}

/**
 * Pull PIHPS trading days after the last checked day. One day is 34
 * provincial requests. The previous cron died with "Too many subrequests"
 * by fetching several days, including the national scope, in one invocation.
 */
export const ingestRecent = Effect.fn("Pihps.ingestRecent")(function* (maxDays: number) {
  const source = yield* PihpsSource
  const store = yield* PriceStore
  const today = yield* todayInJakarta()
  const startedAt = DateTime.formatIso(yield* DateTime.now)
  const checked = yield* store.latestCheckedDate
  const start = nextIsoDay(checked ?? STATIC_LIVE_THROUGH)
  const dates = tradingDaysFromThrough(start, today).slice(0, maxDays)
  if (dates.length === 0) {
    yield* store.recordJob({
      startedAt,
      status: "complete",
      rowsUpserted: 0,
      note: `caught up through ${checked ?? STATIC_LIVE_THROUGH}`,
    })
    return { dates, rowsUpserted: 0 } satisfies IngestResult
  }

  let rowsUpserted = 0
  for (const date of dates) {
    const batches = yield* Effect.forEach(
      Object.entries(BI_TO_KEMENDAGRI),
      ([provinceId, regionCode]) =>
        Effect.gen(function* () {
          const json = yield* source.fetchGrid(date, provinceId)
          return yield* parsePihpsGrid(date, regionCode, json)
        }),
      { concurrency: 5 },
    )
    const rows = batches.flat()
    const status = rows.length > 0 ? "live" : "empty"
    rowsUpserted += yield* store.upsertDay(date, status, rows, startedAt)
  }

  yield* store.recordJob({
    startedAt,
    status: "complete",
    rowsUpserted,
    note: `pihps ${dates.join(",")}`,
  })
  return { dates, rowsUpserted } satisfies IngestResult
})
