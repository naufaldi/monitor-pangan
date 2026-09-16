import { COMMODITIES, MOCK_DATES, type Commodity } from "./catalog.ts"
import { loadProvinces } from "./geo.ts"

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

/**
 * Data contract the UI renders against. The real pipeline (Effect + D1)
 * will implement this same interface, so no UI rework is needed later.
 */
export interface PriceDataProvider {
  dates(): string[]
  provinces(): { code: string; name: string }[]
  snapshot(date: string, commodityId: string): Snapshot
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
    price: mockPrice(commodity, p.code, dateIndex),
  }))
  const nationalAvg =
    Math.round(rows.reduce((sum, r) => sum + r.price, 0) / rows.length / 50) *
    50
  return { date, commodity, nationalAvg, rows }
}

export const provider: PriceDataProvider = {
  dates: () => [...MOCK_DATES],
  provinces: () => provinces,
  snapshot: (date, commodityId) => buildSnapshot(date, commodityId),
}
