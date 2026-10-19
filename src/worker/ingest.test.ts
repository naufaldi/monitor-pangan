import { Effect, Layer, Logger, LogLevel, TestClock } from "effect"
import { assert, it } from "@effect/vitest"
import { BI_TO_KEMENDAGRI } from "#/data/pihps-catalog.ts"
import { parsePihpsGrid } from "#/data/pihps-grid.ts"
import { ingestRecent, PihpsFetchError, PihpsSource, StoreError, PriceStore, type JobRecord } from "#/worker/ingest.ts"
import type { PihpsPriceCell } from "#/data/pihps-grid.ts"
import { sqliteFixture } from "./sqlite-test.ts"
import { d1PriceStoreLayer, ensureMigrated, type D1Database } from "./d1-store.ts"
import { tradingDaysFromThrough } from "../lib/civil-date.ts"
import { injectFreshScript } from "#/worker/html.ts"

const JAKARTA_GRID = {
  data: [
    { name: "Beras", level: 1, no: 1, "28/09/2026": "16,950" },
    { name: "Daging Ayam", level: 1, no: 2, "28/09/2026": "41,700" },
    { name: "Daging Sapi", level: 1, no: 3, "28/09/2026": "150,100" },
    { name: "Telur Ayam", level: 1, no: 4, "28/09/2026": "26,350" },
    { name: "Bawang Merah", level: 1, no: 5, "28/09/2026": "36,950" },
    { name: "Bawang Putih", level: 1, no: 6, "28/09/2026": "43,950" },
    { name: "Cabai Merah", level: 1, no: 7, "28/09/2026": "56,450" },
    { name: "Cabai Rawit", level: 1, no: 8, "28/09/2026": "71,100" },
    { name: "Minyak Goreng", level: 1, no: 9, "28/09/2026": "22,850" },
    { name: "Gula Pasir", level: 1, no: 10, "28/09/2026": "19,950" },
    { name: "Beras Kualitas Bawah", level: 2, no: 11, "28/09/2026": "15,000" },
  ],
}

const CLOCK = 1790579700000

it.effect("decodes a PIHPS provincial grid into rupiah cells", () =>
  Effect.gen(function* () {
    const cells = yield* parsePihpsGrid("2026-09-28", "31", JAKARTA_GRID)
    assert.strictEqual(cells.length, 10)
    assert.deepStrictEqual(
      cells.find((cell) => cell.commodityId === "beras"),
      { date: "2026-09-28", commodityId: "beras", regionCode: "31", price: 16950 },
    )
    const empty = yield* parsePihpsGrid("2026-09-28", "31", {
      data: [{ name: "Beras", level: 1, "28/09/2026": "-" }],
    })
    assert.deepStrictEqual(empty, [])
    const failure = yield* Effect.flip(parsePihpsGrid("2026-09-28", "31", { data: "nope" }))
    assert.strictEqual(failure._tag, "PihpsDecodeError")
  }),
)

it.effect("ingest stores the next trading day after the baked snapshot", () => {
  const days: Array<{ date: string; status: string; rows: readonly PihpsPriceCell[] }> = []
  const jobs: JobRecord[] = []
  const store = Layer.succeed(PriceStore, {
    coverageSince: () => Effect.succeed([]),
    upsertDay: (date, status, rows) =>
      Effect.sync(() => {
        days.push({ date, status, rows })
        return rows.length
      }),
    recordJob: (job) =>
      Effect.sync(() => {
        jobs.push(job)
      }),
    freshSince: () => Effect.succeed({ latestDate: null, dates: [], prices: {} }),
  })
  const source = Layer.succeed(PihpsSource, {
    fetchGrid: (date) => {
      const [year, month, day] = date.split("-")
      const column = `${day}/${month}/${year}`
      return Effect.succeed({
        data: JAKARTA_GRID.data.map((row) => ({
          name: row.name,
          level: row.level,
          no: row.no,
          [column]: row["28/09/2026"],
        })),
      })
    },
  })
  return Effect.gen(function* () {
    yield* TestClock.setTime(CLOCK)
    const result = yield* ingestRecent(1)
    assert.deepStrictEqual(result.dates, ["2026-09-17"])
    assert.strictEqual(days.length, 1)
    assert.strictEqual(days[0]?.status, "live")
    assert.strictEqual(days[0]?.rows.length, Object.keys(BI_TO_KEMENDAGRI).length * 10)
    assert.ok(days[0]?.rows.some((row) => row.regionCode === "31" && row.commodityId === "beras" && row.price === 16950))
    assert.strictEqual(jobs[0]?.status, "complete")
    assert.ok(jobs[0]?.note.includes("2026-09-17"))
  }).pipe(Effect.provide(Layer.mergeAll(store, source)))
})

it.effect("injects the freshness payload before </head> and escapes markup", () =>
  Effect.sync(() => {
    const html = injectFreshScript("<head></head><body>", {
      latestDate: "2026-09-28",
      dates: ["2026-09-28"],
      prices: { "2026-09-28:beras:31": 16950 },
    })
    assert.ok(html.includes('<script id="mp-pihps-fresh"'))
    assert.ok(html.indexOf("mp-pihps-fresh") < html.indexOf("</head>"))
    const hostile = injectFreshScript("<head></head>", {
      latestDate: null,
      dates: [],
      prices: { "<script>": 1 },
    })
    assert.ok(!hostile.includes("<script>"))
    assert.ok(hostile.includes("\\u003cscript>"))
  }),
)

it.effect("source failures persist one sanitized terminal job and remain failed", () => {
  const jobs: JobRecord[] = []
  const days: string[] = []
  const error = new PihpsFetchError({ message: "private upstream URL with token=secret" })
  return Effect.gen(function* () {
    yield* TestClock.setTime(CLOCK)
    const failure = yield* Effect.flip(ingestRecent(1))
    assert.strictEqual(failure._tag, "PihpsFetchError")
    assert.strictEqual(failure.message, error.message)
    assert.strictEqual(jobs.length, 1)
    assert.strictEqual(jobs[0]?.status, "error")
    assert.strictEqual(jobs[0]?.rowsUpserted, 0)
    assert.ok(jobs[0]?.note.includes("2026-09-17"))
    assert.ok(jobs[0]?.note.includes("PihpsFetchError"))
    assert.ok(!jobs[0]?.note.includes("secret"))
    assert.deepStrictEqual(days, ["error"])
  }).pipe(Effect.provide(Layer.mergeAll(
    Layer.succeed(PihpsSource, { fetchGrid: () => Effect.fail(error) }),
    Layer.succeed(PriceStore, {
      coverageSince: () => Effect.succeed([]),
      upsertDay: (_date, status) => Effect.sync(() => { days.push(status); return 0 }),
      recordJob: (job) => Effect.sync(() => { jobs.push(job) }),
      freshSince: () => Effect.succeed({ latestDate: null, dates: [], prices: {} }),
    }),
  )))
})

it.effect("a second trigger recovers current-day publication with 34 requests and concurrency five", () => Effect.gen(function* () {
  yield* TestClock.setTime(1792401300000)
  const db = yield* sqliteFixture
  yield* Effect.sync(() => {
    db.sqlite.prepare("INSERT INTO source_days (date, source_id, status, checked_at) VALUES (?, 'pihps', 'live', ?)").run("2026-10-16", "2026-10-16T10:15:00Z")
    for (const date of tradingDaysFromThrough("2026-09-17", "2026-10-15")) db.sqlite.prepare("INSERT INTO source_days VALUES (?, 'pihps', 'live', ?)").run(date, "2026-10-19T00:00:00Z")
  })
  let published = false
  let calls = 0
  let active = 0
  let maximum = 0
  const source = Layer.succeed(PihpsSource, { fetchGrid: () => Effect.gen(function* () {
    yield* Effect.sync(() => { calls++; active++; maximum = Math.max(maximum, active) })
    yield* Effect.yieldNow()
    yield* Effect.sync(() => { active-- })
    return { data: published ? [{ name: "Beras", level: 1, "19/10/2026": "16,000" }] : [] }
  }) })
  yield* Effect.gen(function* () {
    const store = yield* PriceStore
    const first = yield* ingestRecent(1)
    assert.deepStrictEqual(first, { dates: ["2026-10-19"], rowsUpserted: 0 })
    assert.strictEqual((yield* store.coverageSince("2026-10-18"))[0]?.status, "pending")
    published = true
    const second = yield* ingestRecent(1)
    assert.deepStrictEqual(second, { dates: ["2026-10-19"], rowsUpserted: 34 })
    assert.strictEqual((yield* store.coverageSince("2026-10-18"))[0]?.status, "live")
    assert.strictEqual(calls, 68)
    assert.strictEqual(maximum, 5)
    assert.strictEqual(db.sqlite.prepare("SELECT COUNT(*) AS count FROM job_runs WHERE status = 'complete'").get()?.count, 2)
  }).pipe(Effect.provide(Layer.mergeAll(d1PriceStoreLayer(db.db), source)))
}))

it.effect("caught-up weekends record a no-op without fetching source data", () => Effect.gen(function* () {
  yield* TestClock.setTime(1792304100000)
  const jobs: JobRecord[] = []
  const result = yield* ingestRecent(1).pipe(Effect.provide(Layer.mergeAll(
    Layer.succeed(PihpsSource, { fetchGrid: () => Effect.die("no-op must not fetch") }),
    Layer.succeed(PriceStore, {
      coverageSince: () => Effect.succeed(tradingDaysFromThrough("2026-09-17", "2026-10-16").map((date) => ({ date, status: "live" as const }))),
      upsertDay: () => Effect.die("no-op must not write a day"),
      recordJob: (job) => Effect.sync(() => { jobs.push(job) }),
      freshSince: () => Effect.succeed({ latestDate: null, dates: [], prices: {} }),
    }),
  )))
  assert.deepStrictEqual(result, { dates: [], rowsUpserted: 0 })
  assert.strictEqual(jobs.length, 1)
  assert.strictEqual(jobs[0]?.note, "target=none category=complete")
}))

it.effect("a partial database failure records confirmed cells and an unresolved error day", () => Effect.gen(function* () {
  yield* TestClock.setTime(CLOCK)
  const fixture = yield* sqliteFixture
  let batches = 0
  const db: D1Database = { ...fixture.db, batch: (statements) => ++batches === 2 ? Promise.reject(new Error("private DB details")) : fixture.db.batch(statements) }
  yield* ensureMigrated(db)
  batches = 0
  const source = Layer.succeed(PihpsSource, { fetchGrid: () => Effect.succeed({ data: JAKARTA_GRID.data.map((row) => ({ ...row, "17/09/2026": row["28/09/2026"] })) }) })
  const failure = yield* Effect.flip(ingestRecent(1)).pipe(Effect.provide(Layer.mergeAll(d1PriceStoreLayer(db), source)))
  assert.strictEqual(failure._tag, "StoreError")
  assert.strictEqual(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM prices_daily").get()?.count, 40)
  const job = fixture.sqlite.prepare("SELECT status, rows_upserted, note FROM job_runs").get()
  assert.strictEqual(job?.status, "error")
  assert.strictEqual(job?.rows_upserted, 40)
  assert.strictEqual(job?.note, "target=2026-09-17 category=StoreError")
  assert.strictEqual(fixture.sqlite.prepare("SELECT status FROM source_days WHERE date = '2026-09-17'").get()?.status, "error")
}))

it.effect("a terminal-job write failure cannot hide the original source failure", () => Effect.gen(function* () {
  yield* TestClock.setTime(CLOCK)
  const failure = yield* Effect.flip(ingestRecent(1)).pipe(Effect.provide(Layer.mergeAll(
    Layer.succeed(PihpsSource, { fetchGrid: () => Effect.fail(new PihpsFetchError({ message: "source" })) }),
    Layer.succeed(PriceStore, {
      coverageSince: () => Effect.succeed([]),
      upsertDay: () => Effect.fail(new StoreError({ message: "marker write" })),
      recordJob: () => Effect.fail(new StoreError({ message: "job write" })),
      freshSince: () => Effect.succeed({ latestDate: null, dates: [], prices: {} }),
    }),
  )))
  assert.strictEqual(failure._tag, "PihpsFetchError")
  assert.strictEqual(failure.message, "source")
}))

it.effect("live, pending, empty and no-op runs log completion only after terminal persistence", () => Effect.gen(function* () {
  const cases = [
    { clock: CLOCK, covered: false, price: true, targetDate: "2026-09-17", outcome: "live", count: 34 },
    { clock: CLOCK, covered: false, price: false, targetDate: "2026-09-17", outcome: "empty", count: 0 },
    { clock: 1792401300000, covered: true, price: false, targetDate: "2026-10-19", outcome: "pending", count: 0 },
    { clock: 1792304100000, covered: true, price: false, targetDate: null, outcome: "noop", count: 0 },
  ] as const
  for (const scenario of cases) {
    yield* TestClock.setTime(scenario.clock)
    const events: unknown[] = []
    const logger = Logger.make(({ message }) => { events.push(message) })
    yield* ingestRecent(1).pipe(Effect.provide(Layer.mergeAll(
      Logger.add(logger), Logger.minimumLogLevel(LogLevel.Info),
      Layer.succeed(PihpsSource, { fetchGrid: (date) => {
        const [year, month, day] = date.split("-")
        return Effect.succeed({ data: scenario.price ? [{ name: "Beras", level: 1, [`${day}/${month}/${year}`]: "16,000" }] : [] })
      } }),
      Layer.succeed(PriceStore, {
        coverageSince: () => Effect.succeed(scenario.covered ? tradingDaysFromThrough("2026-09-17", "2026-10-16").map((date) => ({ date, status: "live" as const })) : []),
        upsertDay: (_date, _status, rows) => Effect.succeed(rows.length),
        recordJob: () => Effect.sync(() => { events.push("job persisted") }),
        freshSince: () => Effect.succeed({ latestDate: null, dates: [], prices: {} }),
      }),
    )))
    assert.deepStrictEqual(events, ["job persisted", [{ event: "pihps_ingest", targetDate: scenario.targetDate, outcome: scenario.outcome, category: "complete", rowsUpserted: scenario.count, jobRecorded: true }]])
  }
}))

it.effect("failed terminal persistence emits no completion claim", () => Effect.gen(function* () {
  yield* TestClock.setTime(CLOCK)
  const events: unknown[] = []
  const failure = yield* Effect.flip(ingestRecent(1)).pipe(Effect.provide(Layer.mergeAll(
    Logger.add(Logger.make(({ message }) => { events.push(message) })), Logger.minimumLogLevel(LogLevel.Info),
    Layer.succeed(PihpsSource, { fetchGrid: () => Effect.succeed({ data: [] }) }),
    Layer.succeed(PriceStore, {
      coverageSince: () => Effect.succeed([]),
      upsertDay: () => Effect.succeed(0),
      recordJob: () => Effect.fail(new StoreError({ message: "private failed write details" })),
      freshSince: () => Effect.succeed({ latestDate: null, dates: [], prices: {} }),
    }),
  )))
  assert.strictEqual(failure._tag, "StoreError")
  assert.deepStrictEqual(events, [[{ event: "pihps_job_record_failed", targetDate: "2026-09-17", outcome: "error", category: "StoreError", originalCategory: "complete", rowsUpserted: 0, jobRecorded: false }]])
}))
