import { Clock, Context, Data, Effect, Layer, Schedule, Schema } from "effect"

/**
 * Daily PIHPS ingest worker (Cloudflare Workers Cron Triggers + D1).
 *
 * PIHPS surveys traditional markets Mon–Fri 09:00–11:00 WIB and publishes
 * around 13:00 WIB. `wrangler.toml` fires `scheduled` once a day after
 * publish time plus a weekday-evening retry; every run backfills the last
 * seven calendar days so missed runs, holidays, and late publishes heal
 * without manual re-scrapes. Upserts are idempotent (`ON CONFLICT ... DO
 * UPDATE`) and each date leaves a row in `job_runs` for observability.
 *
 * Scrape parameters mirror `scripts/scrape-pihps.mjs` (national + 34
 * surveyed BI provinces, `price_type_id=1` eceran, `tipe_laporan=1`
 * harian). No secrets: PIHPS is keyless.
 */

export const PIHPS_BASE = "https://www.bi.go.id"
export const PIHPS_REFERER = `${PIHPS_BASE}/hargapangan/TabelHarga/PasarTradisionalDaerah`
export const LOOKBACK_DAYS = 7

const BI_TO_KEMENDAGRI: Readonly<Record<string, string>> = {
  1: "11", 2: "12", 3: "13", 4: "14", 6: "15", 8: "16", 7: "17", 10: "18",
  9: "19", 5: "21", 12: "32", 14: "33", 15: "34", 16: "35", 11: "36",
  13: "31", 20: "61", 22: "62", 21: "63", 23: "64", 24: "65", 17: "51",
  18: "52", 19: "53", 26: "73", 28: "72", 29: "71", 27: "74", 25: "75",
  30: "76", 31: "81", 32: "82", 33: "91", 34: "92",
}

const CATEGORY_TO_GROUP: Readonly<Record<string, string>> = {
  Beras: "beras",
  "Bawang Merah": "bawang-merah",
  "Bawang Putih": "bawang-putih",
  "Cabai Merah": "cabai-merah",
  "Cabai Rawit": "cabai-rawit",
  "Daging Ayam": "daging-ayam",
  "Daging Sapi": "daging-sapi",
  "Telur Ayam": "telur-ayam",
  "Gula Pasir": "gula-pasir",
  "Minyak Goreng": "minyak-goreng",
}

export const COMMODITY_IDS = Object.values(CATEGORY_TO_GROUP)
export const INGEST_LEVEL = "eceran"
export const INGEST_SOURCE = "pihps"

/** YYYY-MM-DD in Asia/Jakarta (WIB, UTC+7, no DST) for a Unix-millis instant. */
const wibDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export const wibDateKey = (millis: number): string => wibDayFormatter.format(millis)

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const daysFromCivil = (year: number, month: number, day: number): number => {
  const shiftedMonth = month <= 2 ? month + 9 : month - 3
  const shiftedYear = month <= 2 ? year - 1 : year
  const era = Math.floor(shiftedYear / 400)
  const yearOfEra = shiftedYear - era * 400
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

const civilFromDays = (days: number): string => {
  const shifted = days + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  )
  const year = yearOfEra + era * 400
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1
  const month = monthPart < 10 ? monthPart + 3 : monthPart - 9
  const fullYear = month <= 2 ? year + 1 : year
  const pad = (n: number): string => String(n).padStart(2, "0")
  return `${fullYear}-${pad(month)}-${pad(day)}`
}

/** UTC ISO-8601 instant for Unix millis without touching the wall clock. */
export const isoFromMillis = (millis: number): string => {
  const dayMillis = Math.floor(millis / 86_400_000)
  const timeMillis = millis - dayMillis * 86_400_000
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0")
  const hours = Math.floor(timeMillis / 3_600_000)
  const minutes = Math.floor((timeMillis % 3_600_000) / 60_000)
  const seconds = Math.floor((timeMillis % 60_000) / 1000)
  const ms = timeMillis % 1000
  return `${civilFromDays(dayMillis)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}Z`
}

const isoToDayNumber = (iso: string): number | null => {
  const match = ISO_DATE.exec(iso)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return daysFromCivil(year, month, day)
}

/** Sunday = 0 .. Saturday = 6 for a YYYY-MM-DD date key. */
const isoWeekdaySun0 = (iso: string): number | null => {
  const days = isoToDayNumber(iso)
  if (days === null) return null
  return (((days + 4) % 7) + 7) % 7
}

/** PIHPS surveys Monday–Friday only; weekends show the last trading day. */
export const isTradingDayIso = (iso: string): boolean => {
  const weekday = isoWeekdaySun0(iso)
  return weekday !== null && weekday !== 0 && weekday !== 6
}

/**
 * Dates this run should ingest: the WIB today plus the previous
 * `lookbackDays` calendar days, weekends dropped, oldest first. The window
 * is what heals missed runs and late publishes.
 */
export const planIngestDates = (wibToday: string, lookbackDays: number): string[] => {
  const today = isoToDayNumber(wibToday)
  if (today === null || lookbackDays < 0) return []
  const out: string[] = []
  for (let back = lookbackDays; back >= 0; back--) {
    const iso = civilFromDays(today - back)
    if (isTradingDayIso(iso)) out.push(iso)
  }
  return out
}

/** PIHPS grid column header for an ISO date, e.g. `2026-09-24` → `24/09/2026`. */
export const gridColumnFor = (iso: string): string => {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

/** Mirrors `toNum` in `scripts/scrape-pihps.mjs`: `-`/empty → null. */
export const parseGridValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string" && typeof value !== "number") return null
  const text = String(value).trim()
  if (text === "" || text === "-") return null
  const deGrouped = text.replaceAll(".", "")
  if (/,\d{3}$/.test(deGrouped)) return Number(deGrouped.replace(",", ""))
  const parsed = Number(deGrouped.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

export class PihpsFetchError extends Data.TaggedError("PihpsFetchError")<{
  readonly date: string
  readonly provinceId: string
  readonly reason: string
}> {}

export class PihpsDecodeError extends Data.TaggedError("PihpsDecodeError")<{
  readonly date: string
  readonly reason: string
}> {}

export class StoreError extends Data.TaggedError("StoreError")<{
  readonly reason: string
}> {}

const GridEnvelopeSchema = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
})

const GridRowSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  level: Schema.Number,
})

export const decodeGridEnvelope = Schema.decodeUnknown(GridEnvelopeSchema)

export const decodeGridRow = Schema.decodeUnknown(GridRowSchema)

export type PriceCell = {
  readonly commodityId: string
  readonly regionCode: string | null
  readonly price: number | null
}

export type DayPrices = {
  readonly date: string
  readonly scopes: number
  readonly liveCells: number
  readonly cells: ReadonlyArray<PriceCell>
}

export type FetchLike = (
  url: string,
  init?: { readonly headers: Record<string, string> },
) => Promise<{
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}>

export type PihpsGridParams = {
  readonly startDate: string
  readonly endDate: string
  readonly provinceId?: string
}

export class PihpsClient extends Context.Tag("PihpsClient")<
  PihpsClient,
  {
    readonly fetchGrid: (params: PihpsGridParams) => Effect.Effect<unknown, PihpsFetchError>
  }
>() {
  static Live = (fetchFn: FetchLike): Layer.Layer<PihpsClient> =>
    Layer.succeed(PihpsClient, {
      fetchGrid: (params) =>
        Effect.tryPromise({
          try: () => {
            const url = new URL(`${PIHPS_BASE}/hargapangan/WebSite/TabelHarga/GetGridDataDaerah`)
            url.searchParams.set("price_type_id", "1")
            url.searchParams.set("tipe_laporan", "1")
            url.searchParams.set("start_date", params.startDate)
            url.searchParams.set("end_date", params.endDate)
            if (params.provinceId !== undefined) url.searchParams.set("province_id", params.provinceId)
            return fetchFn(url.toString(), {
              headers: {
                "User-Agent": "Mozilla/5.0 monitor-pangan/0.1.0",
                Referer: PIHPS_REFERER,
                Accept: "application/json",
              },
            }).then(async (res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              return (await res.json()) as unknown
            })
          },
          catch: (cause) =>
            new PihpsFetchError({
              date: params.startDate,
              provinceId: params.provinceId ?? "nasional",
              reason: String(cause).slice(0, 200),
            }),
        }),
    })
}

const retryPolicy = Schedule.intersect(Schedule.exponential("500 millis"), Schedule.recurs(3))

export const fetchDayPrices = Effect.fn("Ingest.fetchDayPrices")(function* (iso: string) {
  const client = yield* PihpsClient
  const column = gridColumnFor(iso)
  const scopes: ReadonlyArray<{ readonly bi: string; readonly regionCode: string | null }> = [
    { bi: "", regionCode: null },
    ...Object.entries(BI_TO_KEMENDAGRI).map(([bi, regionCode]) => ({ bi, regionCode })),
  ]
  const cells: PriceCell[] = []
  let scopesSeen = 0
  for (const scope of scopes) {
    const provinceId = scope.bi === "" ? undefined : scope.bi
    const payload = yield* client
      .fetchGrid({ startDate: iso, endDate: iso, provinceId })
      .pipe(Effect.retry(retryPolicy))
    const envelope = yield* decodeGridEnvelope(payload).pipe(
      Effect.mapError(
        (cause) => new PihpsDecodeError({ date: iso, reason: `envelope: ${String(cause).slice(0, 160)}` }),
      ),
    )
    const found: Record<string, number | null> = {}
    for (const raw of envelope.data) {
      const row = yield* decodeGridRow(raw).pipe(
        Effect.mapError(
          (cause) => new PihpsDecodeError({ date: iso, reason: `row: ${String(cause).slice(0, 160)}` }),
        ),
      )
      const group = row.level === 1 ? CATEGORY_TO_GROUP[row.name] : undefined
      if (group !== undefined) {
        found[group] = parseGridValue((raw as Record<string, unknown>)[column])
      }
    }
    scopesSeen += 1
    for (const commodityId of COMMODITY_IDS) {
      cells.push({ commodityId, regionCode: scope.regionCode, price: found[commodityId] ?? null })
    }
  }
  const liveCells = cells.filter((c) => c.regionCode !== null && c.price !== null).length
  return { date: iso, scopes: scopesSeen, liveCells, cells } satisfies DayPrices
})

export type D1StatementLike = {
  bind(...values: ReadonlyArray<unknown>): D1StatementLike
  run(): Promise<unknown>
}

export type D1DatabaseLike = {
  prepare(query: string): D1StatementLike
  batch(statements: ReadonlyArray<D1StatementLike>): Promise<ReadonlyArray<unknown>>
}

export const UPSERT_PRICE_SQL =
  `INSERT INTO prices_daily (date, commodity_id, region_code, level, price, source_id) VALUES (?, ?, ?, ?, ?, ?) ` +
  `ON CONFLICT(date, commodity_id, region_code, level) DO UPDATE SET price=excluded.price, source_id=excluded.source_id`

export const INSERT_RUN_SQL =
  `INSERT INTO job_runs (started_at, source_id, status, rows_upserted, note) VALUES (?, ?, ?, ?, ?)`

export type JobLog = {
  readonly date: string
  readonly status: "complete" | "empty"
  readonly rowsUpserted: number
  readonly note: string
}

export class PriceStore extends Context.Tag("PriceStore")<
  PriceStore,
  {
    readonly upsertDay: (
      day: DayPrices,
      at: string,
    ) => Effect.Effect<JobLog, StoreError>
  }
>() {
  static D1 = (db: D1DatabaseLike): Layer.Layer<PriceStore> =>
    Layer.succeed(PriceStore, {
      upsertDay: (day, at) =>
        Effect.tryPromise({
          try: async () => {
            const priced = day.cells.filter(
              (c): c is PriceCell & { readonly regionCode: string; readonly price: number } =>
                c.regionCode !== null && c.price !== null,
            )
            const statements = priced.map((c) =>
              db
                .prepare(UPSERT_PRICE_SQL)
                .bind(day.date, c.commodityId, c.regionCode, INGEST_LEVEL, c.price, INGEST_SOURCE),
            )
            if (statements.length > 0) await db.batch(statements)
            const status = priced.length > 0 ? "complete" : "empty"
            await db
              .prepare(INSERT_RUN_SQL)
              .bind(at, INGEST_SOURCE, status, priced.length, `cron ${day.date}: scopes=${day.scopes} live=${day.liveCells}`)
              .run()
            return {
              date: day.date,
              status,
              rowsUpserted: priced.length,
              note: `scopes=${day.scopes} live=${day.liveCells}`,
            } satisfies JobLog
          },
          catch: (cause) => new StoreError({ reason: String(cause).slice(0, 200) }),
        }),
    })
}

export type IngestSummary = {
  readonly runDate: string
  readonly cron: string
  readonly targets: ReadonlyArray<string>
  readonly upserted: number
  readonly skippedEmpty: ReadonlyArray<string>
  readonly logs: ReadonlyArray<JobLog>
}

export const runIngestForDates = Effect.fn("Ingest.runForDates")(function* (
  dates: ReadonlyArray<string>,
  startedAt: string,
  cron: string,
) {
  const store = yield* PriceStore
  const logs: JobLog[] = []
  let upserted = 0
  const skippedEmpty: string[] = []
  yield* Effect.forEach(dates, (iso) =>
    Effect.gen(function* () {
      const day = yield* fetchDayPrices(iso)
      const log = yield* store.upsertDay(day, startedAt)
      logs.push(log)
      if (log.status === "empty") {
        skippedEmpty.push(iso)
      } else {
        upserted += log.rowsUpserted
      }
    }),
  )
  return {
    runDate: startedAt,
    cron,
    targets: [...dates],
    upserted,
    skippedEmpty,
    logs,
  } satisfies IngestSummary
})

export const runIngest = Effect.fn("Ingest.run")(function* (
  options: { readonly lookbackDays?: number; readonly cron?: string } = {},
) {
  const nowMillis = yield* Clock.currentTimeMillis
  const today = wibDateKey(nowMillis)
  const dates = planIngestDates(today, options.lookbackDays ?? LOOKBACK_DAYS)
  return yield* runIngestForDates(dates, isoFromMillis(nowMillis), options.cron ?? "manual")
})

export type WorkerEnv = {
  readonly ASSETS: { fetch(request: Request): Promise<Response> }
  readonly DB: D1DatabaseLike
}

export type ScheduledController = {
  readonly cron: string
}

export type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void
}

export const scheduled = (
  controller: ScheduledController,
  env: WorkerEnv,
  ctx: WaitUntilContext,
): void => {
  const program = runIngest({ cron: controller.cron }).pipe(
    Effect.provide(PihpsClient.Live(fetch)),
    Effect.provide(PriceStore.D1(env.DB)),
    Effect.tap((summary) =>
      Effect.sync(() => {
        console.log(
          `ingest done cron=${summary.cron} targets=${summary.targets.length} upserted=${summary.upserted} empty=[${summary.skippedEmpty.join(",")}]`,
        )
      }),
    ),
    Effect.tapErrorCause((cause) =>
      Effect.sync(() => {
        console.log(`ingest failed cron=${controller.cron} cause=${String(cause).slice(0, 500)}`)
      }),
    ),
    Effect.ignore,
  )
  ctx.waitUntil(Effect.runPromise(program))
}

const worker = {
  fetch: (request: Request, env: WorkerEnv): Promise<Response> => env.ASSETS.fetch(request),
  scheduled,
}

export default worker
