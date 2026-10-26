import type { Commodity } from "#/data/catalog.ts"
import type { PriceDataProvider, TrendDirection, TrendRange, TrendResolution } from "#/data/provider.ts"
import { trendDirection } from "./format.ts"

export type MoverItem = {
  commodityId: string
  name: string
  unit: Commodity["unit"]
  lastPrice: number
  changePct: number
  direction: TrendDirection
  from: string
  to: string
  resolution: TrendResolution
}

/** Compare observed endpoints in the selected scope. Never borrow national points. */
export function commodityMovers(
  commodities: readonly Commodity[],
  regionCode: string | null,
  range: TrendRange,
  readTrend: PriceDataProvider["trend"],
): MoverItem[] {
  return commodities.flatMap((commodity) => {
    const series = readTrend(commodity.id, regionCode, range)
    const source = regionCode == null ? series.national : series.selected ?? []
    const byDate = new Map(source
      .filter((point) => point.date >= range.from && point.date <= range.to && Number.isFinite(point.price) && point.price > 0)
      .map((point) => [point.date, point]))
    const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    if (points.length < 2) return []
    const first = points[0]!
    const last = points.at(-1)!
    const changePct = ((last.price - first.price) / first.price) * 100
    if (!Number.isFinite(changePct)) return []
    return [{
      commodityId: commodity.id, name: commodity.name, unit: commodity.unit,
      lastPrice: last.price, changePct, direction: trendDirection(changePct),
      from: first.date, to: last.date, resolution: range.resolution,
    }]
  })
}

export function resolutionLabel(resolution: TrendResolution): string {
  switch (resolution) {
    case "day": return "Observasi harian"
    case "week": return "Rata-rata mingguan"
    case "month": return "Rata-rata bulanan"
    default: {
      const exhaustive: never = resolution
      return exhaustive
    }
  }
}
