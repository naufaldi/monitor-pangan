import { COMMODITIES, MOCK_DATES, type Commodity, type PriceUnit } from "./catalog.ts"
import { loadProvinces } from "./geo.ts"
import { LIVE_PRICES } from "./prices.gen.ts"
import { SNAPSHOT_META } from "./snapshot.gen.ts"
import { TREND_MONTHLY, TREND_MONTHS, TREND_WEEKLY, TREND_WEEKS } from "./trends.gen.ts"
import { trendDirection } from "#/lib/format.ts"
import {
  meanRupiah,
  nationalChange,
  previousDateWithHarga,
  provinceChange,
  yearAgoDate,
  type AnchorChange,
} from "#/lib/harga.ts"

export type PriceRow = {
  regionCode: string
  price: number | null
}

export type Snapshot = {
  date: string
  commodity: Commodity
  nationalAvg: number | null
  rows: PriceRow[]
}

export type { AnchorChange }

export type PriceAnchors = {
  harian: AnchorChange | null
  tahunan: AnchorChange | null
}

export type YearSeriesFile = {
  year: string
  dates: string[]
  values: Record<string, Record<string, (number | null)[]>>
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

const provinces = loadProvinces()

const BUNDLED_DATES = new Set(
  Object.keys(LIVE_PRICES).map((key) => key.slice(0, 10)),
)

const yearSeries = new Map<string, YearSeriesFile>()

/** Remember a fetched year file so anchors and day charts can read it. */
export function registerYearSeries(series: YearSeriesFile): void {
  yearSeries.set(series.year, series)
}

/** True when this hari perdagangan is already in the recent price bundle. */
export function isBundledDate(date: string): boolean {
  return BUNDLED_DATES.has(date)
}

function availableDates(): string[] {
  if (SNAPSHOT_META.dates.length > 0) return [...SNAPSHOT_META.dates].sort()
  return [...MOCK_DATES]
}

/** True when this date is a scraped PIHPS survey day. */
function usesLivePrices(date: string): boolean {
  return SNAPSHOT_META.pricesLive && SNAPSHOT_META.liveDates.includes(date)
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

function seriesPrice(
  date: string,
  commodityId: string,
  regionCode: string,
): number | null | undefined {
  const series = yearSeries.get(date.slice(0, 4))
  if (series == null) return undefined
  const index = series.dates.indexOf(date)
  if (index < 0) return undefined
  const column = series.values[commodityId]?.[regionCode]
  if (column == null) return undefined
  return column[index] ?? null
}

function lookupPrice(date: string, commodityId: string, regionCode: string): number | null {
  const fromSeries = seriesPrice(date, commodityId, regionCode)
  if (fromSeries !== undefined) return fromSeries
  if (BUNDLED_DATES.has(date)) return LIVE_PRICES[`${date}:${commodityId}:${regionCode}`] ?? null
  return null
}

function rowsFor(date: string, commodityId: string): Map<string, number | null> {
  const rows = new Map<string, number | null>()
  for (const province of provinces) {
    rows.set(province.code, lookupPrice(date, commodityId, province.code))
  }
  return rows
}

function buildSnapshot(date: string, commodityId: string): Snapshot {
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const pricedRows = rowsFor(date, commodity.id)
  const rows = provinces.map((province) => ({
    regionCode: province.code,
    price: pricedRows.get(province.code) ?? null,
  }))
  const nationalAvg = meanRupiah(
    rows.flatMap((row) => (row.price == null ? [] : [row.price])),
  )
  return { date, commodity, nationalAvg, rows }
}

function hasProvincialHarga(date: string, commodityId: string, regionCode: string): boolean {
  return lookupPrice(date, commodityId, regionCode) != null
}

function hasAnyHarga(date: string, commodityId: string): boolean {
  return provinces.some((province) => hasProvincialHarga(date, commodityId, province.code))
}

/** Perubahan harian and perubahan tahunan for one province, or the national mean. */
export function priceAnchors(
  date: string,
  commodityId: string,
  regionCode?: string | null,
): PriceAnchors {
  const dates = liveSurveyDates()
  const today = rowsFor(date, commodityId)
  const provinceCode = regionCode != null && regionCode !== "" ? regionCode : null
  const harianDate = previousDateWithHarga(dates, date, (candidate) =>
    provinceCode == null
      ? hasAnyHarga(candidate, commodityId)
      : hasProvincialHarga(candidate, commodityId, provinceCode),
  )
  const tahunanDate = yearAgoDate(dates, date)
  const harian =
    harianDate == null
      ? null
      : provinceCode == null
        ? nationalChange(today, rowsFor(harianDate, commodityId), harianDate)
        : provinceChange(
            today.get(provinceCode),
            lookupPrice(harianDate, commodityId, provinceCode),
            harianDate,
          )
  const tahunan =
    tahunanDate == null
      ? null
      : provinceCode == null
        ? nationalChange(today, rowsFor(tahunanDate, commodityId), tahunanDate)
        : provinceChange(
            today.get(provinceCode),
            lookupPrice(tahunanDate, commodityId, provinceCode),
            tahunanDate,
          )
  return { harian, tahunan }
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
    if (snap.nationalAvg == null) continue
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
export function pageSourceNote(date?: string): string {
  const target = date && date !== "" ? date : latestLiveDate()
  if (usesLivePrices(target)) return `Data ${target} · PIHPS eceran.`
  return "Angka di halaman ini data contoh untuk pengembangan UI — bukan data resmi."
}
