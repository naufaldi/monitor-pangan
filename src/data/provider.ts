import { mondayOf, monthBucket } from "#/lib/civil-date.ts"
import { formatDateLong, trendDirection } from "#/lib/format.ts"
import { COMMODITIES, MOCK_DATES, type Commodity, type PriceUnit } from "./catalog.ts"
import { freshDates, freshPrice } from "./fresh-prices.ts"
import { loadProvinces } from "./geo.ts"
import { LIVE_PRICES } from "./prices.gen.ts"
import { SNAPSHOT_META } from "./snapshot.gen.ts"
import { TREND_MONTHLY, TREND_MONTHS, TREND_WEEKLY, TREND_WEEKS } from "./trends.gen.ts"

export type PriceRow = {
  regionCode: string
  price: number | null
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

function availableDates(): string[] {
  if (SNAPSHOT_META.dates.length > 0) return [...SNAPSHOT_META.dates].sort()
  return [...MOCK_DATES]
}

function isFreshDate(date: string): boolean {
  return freshDates().includes(date)
}

/** Live PIHPS survey day. Sample/mock fill is only allowed when this is false. */
function usesLivePrices(date: string): boolean {
  return isFreshDate(date) || (SNAPSHOT_META.pricesLive && SNAPSHOT_META.liveDates.includes(date))
}

/** Newest date with at least one live price. Empty survey days are skipped. */
export function latestLiveDate(): string {
  const live = liveSurveyDates()
  return live[live.length - 1] ?? ""
}

/** Survey days used for live charts — sample/mock dates are excluded. */
export function liveSurveyDates(): string[] {
  const baked = SNAPSHOT_META.liveDates.length > 0 ? SNAPSHOT_META.liveDates : availableDates()
  return [...new Set([...baked, ...freshDates()])].sort()
}

function buildSnapshot(date: string, commodityId: string): Snapshot {
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const dateIndex = Math.max(0, availableDates().indexOf(date))
  const live = usesLivePrices(date)
  const rows = provinces.map((p) => {
    const key = `${date}:${commodity.id}:${p.code}`
    const fromFresh = freshPrice(key)
    if (isFreshDate(date)) return { regionCode: p.code, price: fromFresh ?? null }
    const fromLive = fromFresh ?? LIVE_PRICES[key]
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
  return { date, commodity, nationalAvg, rows }
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

function meanRounded(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length / 50) * 50
}

function upsertPoint(points: TrendPoint[], date: string, price: number): void {
  const index = points.findIndex((point) => point.date === date)
  if (index >= 0) points[index] = { date, price }
  else points.push({ date, price })
}

/**
 * Week and month bundles are baked through the static snapshot. Days that
 * arrived from D1 are folded into the open bucket so the long chart is not
 * stuck on the old average.
 */
function foldFreshPeriods(
  series: TrendSeries,
  commodity: Commodity,
  regionCode: string | null | undefined,
  resolution: "week" | "month",
  requested: TrendRange,
): TrendSeries {
  if (freshDates().length === 0) return series
  const keyOf = resolution === "month" ? monthBucket : mondayOf
  const keys = [...new Set(freshDates().map(keyOf))]
    .filter((key) => key >= requested.from && key <= requested.to)
    .sort()
  if (keys.length === 0) return series
  const survey = liveSurveyDates().filter((date) => date >= requested.from && date <= requested.to)
  const wantSelected = regionCode != null && regionCode !== ""
  const national = series.national.map((point) => ({ ...point }))
  const selected = series.selected == null ? null : series.selected.map((point) => ({ ...point }))
  for (const key of keys) {
    const days = survey.filter((date) => keyOf(date) === key)
    const nationalValues: number[] = []
    const selectedValues: number[] = []
    for (const day of days) {
      const snap = buildSnapshot(day, commodity.id)
      if (snap.nationalAvg > 0) nationalValues.push(snap.nationalAvg)
      if (!wantSelected) continue
      const price = snap.rows.find((row) => row.regionCode === regionCode)?.price
      if (price != null) selectedValues.push(price)
    }
    const nationalPrice = meanRounded(nationalValues)
    if (nationalPrice == null) continue
    upsertPoint(national, key, nationalPrice)
    if (selected != null) {
      const selectedPrice = meanRounded(selectedValues)
      if (selectedPrice != null) upsertPoint(selected, key, selectedPrice)
    }
  }
  national.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  selected?.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const first = national[0]
  const last = national[national.length - 1]
  const changePct =
    first == null || last == null || first.price === 0
      ? 0
      : ((last.price - first.price) / first.price) * 100
  return {
    ...series,
    national,
    selected,
    changePct,
    direction: trendDirection(changePct),
  }
}

function buildTrend(
  commodityId: string,
  regionCode?: string | null,
  range?: Partial<TrendRange>,
): TrendSeries {
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const allDates = liveSurveyDates()
  const requested: TrendRange = {
    from: range?.from ?? allDates[0],
    to: range?.to ?? allDates[allDates.length - 1],
    resolution: range?.resolution ?? "day",
  }
  if (requested.resolution === "week") {
    const hit = seriesTrend(commodity, regionCode, requested, TREND_WEEKS, TREND_WEEKLY);
    if (hit != null) return foldFreshPeriods(hit, commodity, regionCode, "week", requested);
  }
  if (requested.resolution === "month") {
    const hit = seriesTrend(commodity, regionCode, requested, TREND_MONTHS, TREND_MONTHLY);
    if (hit != null) return foldFreshPeriods(hit, commodity, regionCode, "month", requested);
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
  dates: () => liveSurveyDates(),
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
  if (usesLivePrices(date)) return `Data ${formatDateLong(date)} · PIHPS eceran`
  return "Data contoh"
}

/**
 * Footer sentence for the PIHPS day on screen.
 * The "not today" clause is only true when that civil date is before `today` (Asia/Jakarta).
 */
export function pageSourceNote(date: string, today: string): string {
  if (usesLivePrices(date)) {
    const sentence = `Harga dari PIHPS: ${formatDateLong(date)}.`
    if (date < today) return `${sentence} Bukan harga hari ini.`
    return sentence
  }
  return "Angka di halaman ini data contoh untuk pengembangan UI — bukan data resmi."
}
