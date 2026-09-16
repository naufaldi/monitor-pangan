import { COMMODITIES, MOCK_DATES, type Commodity, type PriceUnit } from "./catalog.ts"
import { loadProvinces } from "./geo.ts"
import { LIVE_PRICES } from "./prices.gen.ts"
import { SNAPSHOT_META } from "./snapshot.gen.ts"
import { trendDirection } from "#/lib/format.ts"

export type PriceRow = {
  regionCode: string
  price: number
}

export type Snapshot = {
  date: string
  commodity: Commodity
  nationalAvg: number
  rows: PriceRow[]
}

export type TrendPoint = {
  date: string
  price: number
}

export type TrendDirection = "up" | "down" | "flat"

export type TrendResolution = "day" | "week" | "month"

export type TrendRange = {
  from: string
  to: string
  resolution: TrendResolution
}

export type TrendSeries = {
  commodity: Commodity
  unit: PriceUnit
  national: TrendPoint[]
  selected: TrendPoint[] | null
  changePct: number
  direction: TrendDirection
  range: TrendRange
}

/**
 * Data contract the UI renders against. The real pipeline (Effect + D1)
 * will implement this same interface, so no UI rework is needed later.
 */
export interface PriceDataProvider {
  dates(): string[]
  provinces(): { code: string; name: string }[]
  snapshot(date: string, commodityId: string): Snapshot
  trend(
    commodityId: string,
    regionCode?: string | null,
    range?: Partial<TrendRange>,
  ): TrendSeries
}

/** Deterministic 0..1 hash for stable mock values across reloads. */
function hash01(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10000) / 10000
}

function mockPrice(
  commodity: Commodity,
  regionCode: string,
  dateIndex: number,
): number {
  const spread = hash01(`${commodity.id}:${regionCode}`) - 0.5
  const drift = (hash01(`${commodity.id}:${dateIndex}`) - 0.5) * 0.04
  const value = commodity.anchor * (1 + spread * 0.24 + drift)
  return Math.round(value / 50) * 50
}

const provinces = loadProvinces()

function buildSnapshot(date: string, commodityId: string): Snapshot {
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const dateIndex = Math.max(0, MOCK_DATES.indexOf(date))
  const rows = provinces.map((p) => ({
    regionCode: p.code,
    price:
      LIVE_PRICES[`${date}:${commodity.id}:${p.code}`] ??
      mockPrice(commodity, p.code, dateIndex),
  }))
  const nationalAvg =
    Math.round(rows.reduce((sum, r) => sum + r.price, 0) / rows.length / 50) *
    50
  return { date, commodity, nationalAvg, rows }
}

/**
 * National vs selected-region price path over a date window. Resolution is
 * accepted and echoed for the future 2014-2026 backfill, daily in V1.
 */
function buildTrend(
  commodityId: string,
  regionCode?: string | null,
  range?: Partial<TrendRange>,
): TrendSeries {
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const requested: TrendRange = {
    from: range?.from ?? MOCK_DATES[0],
    to: range?.to ?? MOCK_DATES[MOCK_DATES.length - 1],
    resolution: range?.resolution ?? "day",
  }
  const dates = MOCK_DATES.filter(
    (d) => d >= requested.from && d <= requested.to,
  )
  const national: TrendPoint[] = []
  const selectedPoints: TrendPoint[] = []
  const wantSelected = regionCode != null && regionCode !== ""
  for (const date of dates) {
    const snap = buildSnapshot(date, commodity.id)
    national.push({ date, price: snap.nationalAvg })
    if (wantSelected) {
      const row = snap.rows.find((r) => r.regionCode === regionCode)
      if (row != null) selectedPoints.push({ date, price: row.price })
    }
  }
  const first = national[0]
  const last = national[national.length - 1]
  const changePct =
    first == null || last == null || first.price === 0
      ? 0
      : ((last.price - first.price) / first.price) * 100
  return {
    commodity,
    unit: commodity.unit,
    national,
    selected: wantSelected ? selectedPoints : null,
    changePct,
    direction: trendDirection(changePct),
    range: requested,
  }
}

export const provider: PriceDataProvider = {
  dates: () => [...MOCK_DATES],
  provinces: () => provinces,
  snapshot: (date, commodityId) => buildSnapshot(date, commodityId),
  trend: (commodityId, regionCode, range) =>
    buildTrend(commodityId, regionCode, range),
}

/**
 * Badge label for the header. Live when the date has scraped prices,
 * sample fallback otherwise.
 */
export function dataBadge(date: string): string {
  if (SNAPSHOT_META.pricesLive && SNAPSHOT_META.dates.includes(date))
    return `Data ${date} · PIHPS eceran`
  return "Data contoh"
}
