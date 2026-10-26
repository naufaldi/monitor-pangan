import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { COMMODITIES } from "#/data/catalog.ts"
import type { Snapshot, TrendSeries } from "#/data/provider.ts"
import { csvCell, serializeCsv, snapshotCsv, trendCsv } from "./price-csv.ts"
import { addIsoDays } from "./civil-date.ts"

const snapshot: Snapshot = { date: "2026-09-16", commodity: COMMODITIES[0]!, nationalAvg: 100, pricedCount: 1, rows: [{ regionCode: "31", price: 100 }, { regionCode: "95", price: null }] }
const provinces = [{ code: "31", name: 'Jakarta, "pusat"' }, { code: "95", name: "Papua Pegunungan" }]
const series: TrendSeries = { commodity: COMMODITIES[0]!, unit: "kg", national: [{ date: "2026-09-01", price: 100 }, { date: "2026-09-02", price: 120 }], selected: [{ date: "2026-09-02", price: 110 }], changePct: 20, direction: "up", range: { from: "2026-09-01", to: "2026-09-30", resolution: "month" } }

it.effect("quotes delimiters, quotes and newlines with a UTF-8 BOM and CRLF", () => Effect.sync(() => {
  assert.strictEqual(serializeCsv([["Bawang merah", 'a,b"c\nd', 12000, null]]), '\uFEFFBawang merah,"a,b""c\nd",12000,\r\n')
  assert.strictEqual(csvCell(NaN), "")
  assert.strictEqual(csvCell(Infinity), "")
}))

it.effect("neutralizes spreadsheet expressions only in text fields", () => Effect.sync(() => {
  for (const value of ["=1+1", "+SUM(1)", "-1+2", "@cmd", "  =2", "\t=2", "\r=2", "\n=2"]) {
    assert.ok(csvCell(value).replace(/^"/, "").startsWith("'"))
  }
  assert.strictEqual(csvCell(-12), "-12")
  assert.strictEqual(csvCell("Papua"), "Papua")
}))

it.effect("snapshot export keeps selected date, units, source and empty province cells", () => Effect.sync(() => {
  const file = snapshotCsv(snapshot, provinces, "31")!
  assert.strictEqual(file.filename, "harga-beras-31-2026-09-16.csv")
  assert.ok(file.content.includes('2026-09-16,beras,Beras,31,"Jakarta, ""pusat""",100,kg,PIHPS,observasi_harian,2026-09-16,2026-09-16,31'))
  assert.ok(file.content.includes("95,Papua Pegunungan,,kg,PIHPS"))
  assert.strictEqual(snapshotCsv({ ...snapshot, rows: [{ regionCode: "31", price: null }] }, provinces, null), null)
}))

it.effect("trend export uses all loaded points and labels aggregates and provincial gaps", () => Effect.sync(() => {
  const file = trendCsv(series, provinces[0]!, "all")!
  assert.ok(file.filename.includes("beras-31-all-2026-09-01-2026-09-30-month"))
  assert.ok(file.content.includes('2026-09-01,beras,Beras,31,"Jakarta, ""pusat""",,kg,PIHPS,rata_rata_bulanan'))
  assert.ok(file.content.includes('2026-09-02,beras,Beras,31,"Jakarta, ""pusat""",110,kg,PIHPS,rata_rata_bulanan'))
  assert.strictEqual(file.content.split("\r\n").length, 6)
  assert.strictEqual(trendCsv({ ...series, selected: [] }, provinces[0]!, "all"), null)
  const points = Array.from({ length: 500 }, (_, index) => ({ date: addIsoDays("2025-01-01", index), price: index + 1 }))
  const dense = trendCsv({ ...series, national: points, selected: null, range: { from: points[0]!.date, to: points.at(-1)!.date, resolution: "day" } }, null, "all")!
  assert.strictEqual(dense.content.split("\r\n").length, 502)
}))
