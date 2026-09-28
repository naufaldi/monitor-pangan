import { Effect, Layer, TestClock } from "effect"
import { assert, it } from "@effect/vitest"
import { BI_TO_KEMENDAGRI } from "#/data/pihps-catalog.ts"
import { parsePihpsGrid } from "#/data/pihps-grid.ts"
import { ingestRecent, PihpsSource, PriceStore, type JobRecord } from "#/worker/ingest.ts"
import type { PihpsPriceCell } from "#/data/pihps-grid.ts"
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
    latestCheckedDate: Effect.succeed(null),
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
