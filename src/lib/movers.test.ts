import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { COMMODITIES } from "#/data/catalog.ts"
import type { PriceDataProvider, TrendPoint, TrendRange } from "#/data/provider.ts"
import { commodityMovers } from "./movers.ts"
import { parseTrendSearch } from "./commodity-search.ts"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MoversList } from "#/components/MoversList.tsx"

const range: TrendRange = { from: "2026-09-01", to: "2026-09-30", resolution: "day" }
const read = (selected: TrendPoint[] | null, national: TrendPoint[] = [{ date: "2026-09-01", price: 10 }, { date: "2026-09-30", price: 30 }]): PriceDataProvider["trend"] =>
  () => ({ commodity: COMMODITIES[0]!, unit: "kg", selected, national, changePct: 200, direction: "up", range })

it.effect("uses the selected province and clips observed endpoints to the selected window", () => Effect.sync(() => {
  const result = commodityMovers(COMMODITIES.slice(0, 1), "31", range, read([
    { date: "2026-08-31", price: 500 }, { date: "2026-09-28", price: 80 },
    { date: "2026-09-03", price: 100 }, { date: "2026-10-01", price: 600 },
  ]))
  assert.strictEqual(result[0]?.changePct, -20)
  assert.strictEqual(result[0]?.direction, "down")
  assert.strictEqual(result[0]?.from, "2026-09-03")
  assert.strictEqual(result[0]?.to, "2026-09-28")
  assert.strictEqual(commodityMovers(COMMODITIES.slice(0, 1), null, range, read([]))[0]?.changePct, 200)
}))

it.effect("omits sparse or invalid province coverage instead of borrowing national change", () => Effect.sync(() => {
  for (const points of [null, [], [{ date: "2026-09-03", price: 100 }], [
    { date: "2026-09-03", price: 100 }, { date: "2026-09-03", price: 110 },
    { date: "2026-09-04", price: NaN }, { date: "2026-09-05", price: 0 },
    { date: "2026-09-06", price: Infinity }, { date: "2026-09-07", price: -20 },
  ]]) {
    assert.deepStrictEqual(commodityMovers(COMMODITIES, "95", range, read(points)), [])
  }
}))

it.effect("keeps flat movement explicit and passes timeframe and scope to every bounded read", () => Effect.sync(() => {
  const calls: unknown[] = []
  const weekly = { ...range, resolution: "week" } as const
  const result = commodityMovers(COMMODITIES, "31", weekly, (id, region, requested) => {
    calls.push([id, region, requested])
    return read([{ date: "2026-09-07", price: 100 }, { date: "2026-09-14", price: 100 }])("beras")
  })
  assert.strictEqual(result.length, 10)
  assert.ok(result.every((item) => item.direction === "flat" && item.changePct === 0 && item.resolution === "week"))
  assert.deepStrictEqual(calls[0], ["beras", "31", weekly])
  assert.strictEqual(calls.length, 10)
}))

it.effect("changing active commodity preserves mover comparisons for unchanged scope and window", () => Effect.sync(() => {
  const reader = read([{ date: "2026-09-03", price: 100 }, { date: "2026-09-28", price: 80 }])
  const initial = parseTrendSearch({ komoditas: "beras", provinsi: "31", rentang: "1m" })
  const changed = parseTrendSearch({ ...initial, komoditas: "cabai-merah" })
  const before = commodityMovers(COMMODITIES, initial.provinsi ?? null, range, reader)
  const after = commodityMovers(COMMODITIES, changed.provinsi ?? null, range, reader)
  assert.deepStrictEqual(after, before)
  assert.strictEqual(after.length, 10)
}))

it.effect("groups rises and falls in descending movement magnitude with flat movement explicit", () => Effect.sync(() => {
  const commodities = COMMODITIES.slice(0, 5)
  const lastPrices = [110, 130, 90, 70, 100]
  const items = commodityMovers(commodities, null, range, (id) => read(null, [
    { date: range.from, price: 100 }, { date: range.to, price: lastPrices[commodities.findIndex((commodity) => commodity.id === id)]! },
  ])(id))
  const html = renderToStaticMarkup(createElement(MoversList, {
    items, activeId: "beras", onSelect: () => {}, rangeLabel: "September", scopeLabel: "Nasional", aggregationLabel: "Observasi harian", totalCount: 5,
  }))
  const position = (name: string) => html.indexOf(`>${name}</span>`)
  assert.ok(position("Bawang Merah") < position("Beras"))
  assert.ok(position("Cabai Merah") < position("Bawang Putih"))
  assert.ok(html.includes(">Stabil</h3>"))
  assert.ok(html.includes("aria-pressed=\"true\""))
  assert.ok(!html.includes("NaN") && !html.includes("Infinity"))
}))
