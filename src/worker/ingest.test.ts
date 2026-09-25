import { Effect, Layer, TestClock } from "effect"
import { assert, it } from "@effect/vitest"
import {
  COMMODITY_IDS,
  INGEST_LEVEL,
  INGEST_SOURCE,
  PihpsClient,
  PihpsFetchError,
  PriceStore,
  UPSERT_PRICE_SQL,
  decodeGridRow,
  errorNote,
  fetchDayPrices,
  gridColumnFor,
  isTradingDayIso,
  isoFromMillis,
  parseGridValue,
  planIngestDates,
  runIngest,
  runIngestForDates,
  wibDateKey,
  type DayPrices,
  type PihpsGridParams,
} from "./ingest.ts"

it.effect("maps UTC instants to WIB date keys at the midnight boundary", () =>
  Effect.gen(function* () {
    assert.strictEqual(wibDateKey(Date.UTC(2026, 8, 24, 16, 59, 59)), "2026-09-24")
    assert.strictEqual(wibDateKey(Date.UTC(2026, 8, 24, 17, 0, 0)), "2026-09-25")
    assert.strictEqual(wibDateKey(Date.UTC(2026, 8, 25, 2, 1, 40)), "2026-09-25")
  }))

it.effect("formats UTC ISO instants without the wall clock", () =>
  Effect.gen(function* () {
    assert.strictEqual(isoFromMillis(0), "1970-01-01T00:00:00.000Z")
    assert.strictEqual(isoFromMillis(Date.UTC(2026, 8, 25, 2, 1, 30)), "2026-09-25T02:01:30.000Z")
  }))

it.effect("treats Monday–Friday as trading days", () =>
  Effect.gen(function* () {
    assert.strictEqual(isTradingDayIso("2026-09-16"), true)
    assert.strictEqual(isTradingDayIso("2026-09-25"), true)
    assert.strictEqual(isTradingDayIso("2026-09-28"), true)
    assert.strictEqual(isTradingDayIso("2026-09-26"), false)
    assert.strictEqual(isTradingDayIso("2026-09-27"), false)
    assert.strictEqual(isTradingDayIso("not-a-date"), false)
  }))

it.effect("plans a weekend-free backfill window ending on WIB today", () =>
  Effect.gen(function* () {
    assert.deepStrictEqual(planIngestDates("2026-09-25", 7), [
      "2026-09-18",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ])
    assert.deepStrictEqual(planIngestDates("2026-09-25", 0), ["2026-09-25"])
    assert.deepStrictEqual(planIngestDates("2026-09-27", 0), [])
    assert.deepStrictEqual(planIngestDates("nope", 7), [])
  }))

it.effect("parses PIHPS grid cells like the scrape script", () =>
  Effect.gen(function* () {
    assert.strictEqual(gridColumnFor("2026-09-24"), "24/09/2026")
    assert.strictEqual(parseGridValue("16,350"), 16350)
    assert.strictEqual(parseGridValue("17.150"), 17150)
    assert.strictEqual(parseGridValue("-"), null)
    assert.strictEqual(parseGridValue(""), null)
    assert.strictEqual(parseGridValue(null), null)
    assert.strictEqual(parseGridValue("abc"), null)
  }))

it.effect("rejects grid rows without a category name", () =>
  Effect.gen(function* () {
    const failure = yield* Effect.flip(decodeGridRow({ name: "", level: 1 }))
    assert.strictEqual(failure._tag, "ParseError")
  }))

const CATEGORIES = [
  "Beras",
  "Bawang Merah",
  "Bawang Putih",
  "Cabai Merah",
  "Cabai Rawit",
  "Daging Ayam",
  "Daging Sapi",
  "Telur Ayam",
  "Gula Pasir",
  "Minyak Goreng",
]

const stubClientFor = (liveDates: ReadonlyArray<string>) => {
  const fetchGrid = (params: PihpsGridParams): Effect.Effect<unknown, never> =>
    Effect.succeed(
      liveDates.includes(params.startDate)
        ? {
            data: [
              ...CATEGORIES.map((name, index) => ({
                name,
                level: 1,
                [gridColumnFor(params.startDate)]: `${16 + index},350`,
              })),
              { name: "Beras Bawah I", level: 2, [gridColumnFor(params.startDate)]: "15,000" },
            ],
          }
        : { data: [] },
    )
  return Layer.succeed(PihpsClient, { fetchGrid })
}

it.effect("fetches one date across national plus 34 provinces", () =>
  Effect.gen(function* () {
    const day = yield* fetchDayPrices("2026-09-24").pipe(Effect.provide(stubClientFor(["2026-09-24"])))
    assert.strictEqual(day.scopes, 35)
    assert.strictEqual(day.liveCells, 34 * COMMODITY_IDS.length)
    assert.strictEqual(day.cells.length, 35 * COMMODITY_IDS.length)
    const national = day.cells.filter((c) => c.regionCode === null)
    assert.strictEqual(national.length, COMMODITY_IDS.length)
  }))

it.effect("marks source-empty dates with zero live cells", () =>
  Effect.gen(function* () {
    const day = yield* fetchDayPrices("2026-09-17").pipe(Effect.provide(stubClientFor([])))
    assert.strictEqual(day.liveCells, 0)
  }))

it.effect("ingests priced dates and skips empty ones", () =>
  Effect.gen(function* () {
    const store = Layer.succeed(PriceStore, {
      upsertDay: (day: DayPrices, _at: string) =>
        Effect.succeed({
          date: day.date,
          status: day.liveCells > 0 ? ("complete" as const) : ("empty" as const),
          rowsUpserted: day.liveCells,
          note: `scopes=${day.scopes}`,
        }),
      logFailure: (date: string, _at: string, note: string) =>
        Effect.succeed({ date, status: "failed" as const, rowsUpserted: 0, note }),
    })
    const summary = yield* runIngestForDates(["2026-09-23", "2026-09-24"], "2026-09-25T06:30:00.000Z", "30 6 * * *").pipe(
      Effect.provide(stubClientFor(["2026-09-24"])),
      Effect.provide(store),
    )
    assert.deepStrictEqual(summary.targets, ["2026-09-23", "2026-09-24"])
    assert.deepStrictEqual(summary.skippedEmpty, ["2026-09-23"])
    assert.strictEqual(summary.upserted, 34 * COMMODITY_IDS.length)
    assert.strictEqual(summary.cron, "30 6 * * *")
  }))

it.effect("reads WIB today from the clock for the daily run", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.UTC(2026, 8, 25, 6, 30, 0))
    const store = Layer.succeed(PriceStore, {
      upsertDay: (day: DayPrices, at: string) =>
        Effect.succeed({ date: day.date, status: "empty" as const, rowsUpserted: 0, note: at }),
      logFailure: (date: string, at: string, note: string) =>
        Effect.succeed({ date, status: "failed" as const, rowsUpserted: 0, note: `${at} ${note}` }),
    })
    const summary = yield* runIngest({ lookbackDays: 0, cron: "30 6 * * *" }).pipe(
      Effect.provide(stubClientFor([])),
      Effect.provide(store),
    )
    assert.deepStrictEqual(summary.targets, ["2026-09-25"])
    assert.strictEqual(summary.logs[0]?.note, "2026-09-25T06:30:00.000Z")
  }))

it.live("logs a failed date without aborting the remaining backfill", () =>
  Effect.gen(function* () {
    const failing = "2026-09-21"
    const client = Layer.succeed(PihpsClient, {
      fetchGrid: (params: PihpsGridParams) =>
        params.startDate === failing
          ? Effect.fail(
              new PihpsFetchError({ date: failing, provinceId: "nasional", reason: "boom" }),
            )
          : Effect.succeed({ data: [] }),
    })
    const failures: Array<string> = []
    const store = Layer.succeed(PriceStore, {
      upsertDay: (day: DayPrices, _at: string) =>
        Effect.succeed({ date: day.date, status: "empty" as const, rowsUpserted: 0, note: "" }),
      logFailure: (date: string, _at: string, note: string) =>
        Effect.sync(() => {
          failures.push(date)
          return { date, status: "failed" as const, rowsUpserted: 0, note }
        }),
    })
    const summary = yield* runIngestForDates(
      ["2026-09-21", "2026-09-22"],
      "2026-09-25T06:30:00.000Z",
      "manual",
    ).pipe(Effect.provide(client), Effect.provide(store))
    assert.deepStrictEqual(summary.failed, ["2026-09-21"])
    assert.deepStrictEqual(summary.skippedEmpty, ["2026-09-22"])
    assert.deepStrictEqual(failures, ["2026-09-21"])
    assert.strictEqual(summary.logs.length, 2)
  }))

it.effect("keeps error fields in failure notes", () =>
  Effect.gen(function* () {
    assert.match(
      errorNote(new PihpsFetchError({ date: "2026-09-21", provinceId: "nasional", reason: "HTTP 429" })),
      /HTTP 429/,
    )
    assert.strictEqual(typeof errorNote("plain"), "string")
  }))

it.effect("upserts are idempotent on the natural key", () =>
  Effect.gen(function* () {
    assert.match(UPSERT_PRICE_SQL, /ON CONFLICT\(date, commodity_id, region_code, level\)/)
    assert.match(UPSERT_PRICE_SQL, /DO UPDATE SET/)
    assert.strictEqual(INGEST_LEVEL, "eceran")
    assert.strictEqual(INGEST_SOURCE, "pihps")
  }))
