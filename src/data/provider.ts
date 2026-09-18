import { COMMODITIES, MOCK_DATES, type Commodity, type PriceUnit } from "./catalog.ts"
import { loadProvinces } from "./geo.ts"
import { LIVE_PRICES } from "./prices.gen.ts"
import { SNAPSHOT_META } from "./snapshot.gen.ts"
import { TREND_MONTHLY, TREND_MONTHS, TREND_WEEKLY, TREND_WEEKS } from "./trends.gen.ts"
import { trendDirection } from "#/lib/format.ts"

export type PriceRow = {
  readonly regionCode: string
  readonly price: number | null
}

export type Snapshot = {
  date: string
  commodity: Commodity
  nationalAvg: number
  pricedCount: number
  rows: readonly PriceRow[]
}

export type TrendPoint = {
  readonly date: string
  readonly price: number
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
  national: readonly TrendPoint[]
  selected: readonly TrendPoint[] | null
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

/** D1-backed reads. Day resolution only; week and month stay on bundles. */
export interface AsyncPriceDataProvider {
  snapshot(date: string, commodityId: string): Promise<Snapshot>
  trend(
    commodityId: string,
    regionCode: string | null,
    range: { from: string; to: string },
  ): Promise<TrendSeries>
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

function availableDates(): string[] {
  if (SNAPSHOT_META.dates.length > 0) return [...SNAPSHOT_META.dates].sort()
  return [...MOCK_DATES]
}

/** Live PIHPS survey day. Sample/mock fill is only allowed when this is false. */
function usesLivePrices(date: string): boolean {
  return SNAPSHOT_META.pricesLive && SNAPSHOT_META.liveDates.includes(date)
}

/** Whether a date has live PIHPS coverage (otherwise sample fill applies). */
export function isLiveDate(date: string): boolean {
  return usesLivePrices(date)
}

/** Newest date with at least one live price. Empty survey days are skipped. */
export function latestLiveDate(): string {
  const live = liveSurveyDates()
  return live[live.length - 1] ?? ""
}

/** Survey days used for live charts — sample/mock dates are excluded. */
export function liveSurveyDates(): string[] {
  if (SNAPSHOT_META.liveDates.length > 0) return [...SNAPSHOT_META.liveDates]
  return availableDates()
}

function buildSnapshot(date: string, commodityId: string): Snapshot {
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const dateIndex = Math.max(0, availableDates().indexOf(date))
  const live = usesLivePrices(date)
  const rows = provinces.map((p) => {
    const fromLive = LIVE_PRICES[`${date}:${commodity.id}:${p.code}`]
    return {
      regionCode: p.code,
      price: fromLive ?? (live ? null : mockPrice(commodity, p.code, dateIndex)),
    }
  })
  const priced = rows.filter((r): r is { regionCode: string; price: number } => r.price != null)
  const nationalAvg =
    priced.length === 0
      ? 0
      : Math.round(priced.reduce((sum, r) => sum + r.price, 0) / priced.length / 50) * 50
  return { date, commodity, nationalAvg, pricedCount: priced.length, rows }
}

/**
 * National vs selected-region price path over a date window. Day resolution
 * reads live daily prices. Week and month resolutions read the precomputed
 * backfill bundles, which stay small no matter how many years are scraped.
 */
function seriesTrend(
  commodity: Commodity,
  regionCode: string | null | undefined,
  range: TrendRange,
  labels: string[],
  store: Record<string, (number | null)[]>,
): TrendSeries | null {
  const natKey = `${commodity.id}|nasional`;
  const nat = store[natKey];
  if (nat == null) return null;
  const national: TrendPoint[] = [];
  const selectedPoints: TrendPoint[] = [];
  const wantSelected = regionCode != null && regionCode !== "";
  const sel = wantSelected ? (store[`${commodity.id}|${regionCode}`] ?? []) : [];
  for (let i = 0; i < labels.length; i++) {
    const date = labels[i]!;
    if (date < range.from || date > range.to) continue;
    const price = nat[i];
    if (price == null) continue;
    national.push({ date, price });
    if (wantSelected) {
      const sp = sel[i];
      if (sp != null) selectedPoints.push({ date, price: sp });
    }
  }
  if (national.length === 0) return null;
  const first = national[0]!;
  const last = national[national.length - 1]!;
  const changePct = first.price === 0 ? 0 : ((last.price - first.price) / first.price) * 100;
  return {
    commodity,
    unit: commodity.unit,
    national,
    selected: wantSelected ? selectedPoints : null,
    changePct,
    direction: trendDirection(changePct),
    range,
  };
}

function buildTrend(
  commodityId: string,
  regionCode?: string | null,
  range?: Partial<TrendRange>,
): TrendSeries {
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const allDates = availableDates()
  const requested: TrendRange = {
    from: range?.from ?? allDates[0],
    to: range?.to ?? allDates[allDates.length - 1],
    resolution: range?.resolution ?? "day",
  }
  if (requested.resolution === "week") {
    const hit = seriesTrend(commodity, regionCode, requested, TREND_WEEKS, TREND_WEEKLY);
    if (hit != null) return hit;
  }
  if (requested.resolution === "month") {
    const hit = seriesTrend(commodity, regionCode, requested, TREND_MONTHS, TREND_MONTHLY);
    if (hit != null) return hit;
  }
  const dates = allDates.filter(
    (d) => d >= requested.from && d <= requested.to,
  )
  const national: TrendPoint[] = []
  const selectedPoints: TrendPoint[] = []
  const wantSelected = regionCode != null && regionCode !== ""
  for (const date of dates) {
    const snap = buildSnapshot(date, commodity.id)
    if (snap.rows.every((r) => r.price == null)) continue
    national.push({ date, price: snap.nationalAvg })
    if (wantSelected) {
      const row = snap.rows.find((r) => r.regionCode === regionCode)
      if (row?.price != null) selectedPoints.push({ date, price: row.price })
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
  dates: () => availableDates(),
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
  if (usesLivePrices(date)) return `Data ${date} · PIHPS eceran`
  return "Data contoh"
}

/** Footer/source sentence. Live PIHPS pages must not claim sample data. */
export function pageSourceNote(): string {
  if (usesLivePrices(latestLiveDate())) {
    return "Angka pada halaman ini berasal dari PIHPS eceran Bank Indonesia."
  }
  return "Angka di halaman ini data contoh untuk pengembangan UI — bukan data resmi."
}
