import { DateTime, Option } from "effect"
import { addIsoDays } from "#/lib/civil-date.ts"
import type { Outlet, PublicReport } from "#/data/laporan.ts"

/** Reviewed reports shown by default, counted in civil days including today. */
export const WINDOW_DAYS = 30

/** A decided object is treated as gone once it is this old. The lifecycle rule uses the same span. */
export const PHOTO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export const LIST_PAGE_SIZE = 20

export const MAX_PAGE_SIZE = 100

export const CITY_MEDIAN_FLOOR = 3

export const PROVINCE_CITY_FLOOR = 3

/** First civil day of the public window. Today and the previous 29 days. */
export function windowStart(today: string): string {
  return addIsoDays(today, -(WINDOW_DAYS - 1))
}

/** True when `seenOn` falls inside the public window for `today`. */
export function inWindow(seenOn: string, today: string): boolean {
  return seenOn >= windowStart(today) && seenOn <= today
}

/**
 * True only while a decided object should still exist.
 * `photoKey` stays set after the lifecycle rule deletes the bytes.
 */
export function reportHasPhoto(photoKey: string | null, reviewedAt: string | null, nowMs: number): boolean {
  if (photoKey == null || reviewedAt == null) return false
  const reviewed = DateTime.make(reviewedAt)
  if (Option.isNone(reviewed)) return false
  return nowMs - reviewed.value.epochMillis < PHOTO_RETENTION_MS
}

/** Odd counts use the middle value. Even counts average the two middle values and round to Rp 50. */
export function medianRounded(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid]
  if (upper == null) return 0
  if (sorted.length % 2 === 1) return upper
  const lower = sorted[mid - 1]
  if (lower == null) return upper
  return Math.round((lower + upper) / 2 / 50) * 50
}

export type PlacePin = {
  placeCode: string
  count: number
}

/** One pin per kab/kota. Rows from the other outlet never count. */
export function pins(
  rows: readonly PublicReport[],
  outlet: Outlet,
  commodityId: string | null,
): readonly PlacePin[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.outlet !== outlet) continue
    if (commodityId != null && row.commodityId !== commodityId) continue
    counts.set(row.placeCode, (counts.get(row.placeCode) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([placeCode, count]) => ({ placeCode, count }))
    .sort((a, b) => a.placeCode.localeCompare(b.placeCode))
}

/** City median for the pin panel. Null below three reports for that commodity and outlet. */
export function cityMedian(
  rows: readonly PublicReport[],
  placeCode: string,
  commodityId: string,
  outlet: Outlet,
): { median: number; count: number } | null {
  const prices = rows
    .filter((row) => row.outlet === outlet && row.placeCode === placeCode && row.commodityId === commodityId)
    .map((row) => row.price)
  if (prices.length < CITY_MEDIAN_FLOOR) return null
  return { median: medianRounded(prices), count: prices.length }
}

export type CitySummary = {
  placeCode: string
  name: string
  count: number
}

export type ProvinceOutletRollup =
  | {
      kind: "median"
      median: number
      cityCount: number
      reportCount: number
      low: { name: string; median: number }
      high: { name: string; median: number }
      cities: readonly CitySummary[]
    }
  | {
      kind: "floor"
      cityCount: number
      reportCount: number
      cities: readonly CitySummary[]
    }
  | {
      kind: "counts"
      cityCount: number
      reportCount: number
      cities: readonly CitySummary[]
    }

/**
 * Unweighted median of each city's own median, for one outlet.
 * A missing commodity lists cities and counts and carries no price.
 */
export function provinceRollup(
  rows: readonly PublicReport[],
  provinceCode: string,
  commodityId: string | null,
  outlet: Outlet,
  nameOf: (placeCode: string) => string,
): ProvinceOutletRollup {
  const inProvince = rows.filter(
    (row) => row.outlet === outlet && row.placeCode.startsWith(provinceCode),
  )
  const priced = commodityId == null ? inProvince : inProvince.filter((row) => row.commodityId === commodityId)
  const cities = groupCities(priced, nameOf)
  const reportCount = priced.length
  const cityCount = cities.length
  if (commodityId == null) return { kind: "counts", cityCount, reportCount, cities }
  if (cityCount < PROVINCE_CITY_FLOOR) return { kind: "floor", cityCount, reportCount, cities }
  const medians = cityMediansOf(priced, nameOf)
  const ranked = [...medians].sort((a, b) => a.median - b.median || a.name.localeCompare(b.name, "id"))
  const low = ranked[0]
  const high = ranked[ranked.length - 1]
  if (low == null || high == null) return { kind: "floor", cityCount, reportCount, cities }
  return {
    kind: "median",
    median: medianRounded(medians.map((city) => city.median)),
    cityCount,
    reportCount,
    low: { name: low.name, median: low.median },
    high: { name: high.name, median: high.median },
    cities,
  }
}

/** Hairline province outline. Fill stays off in every state. */
export const provinceOutline = {
  fillOpacity: 0,
  weight: 1,
} as const

export type PhotoPresentation = "image" | "removed" | "label"

/**
 * What a public row shows in the photo slot.
 * `none` without a photo matches a report that never had one.
 */
export function photoPresentation(report: Pick<PublicReport, "hasPhoto" | "evidence">): PhotoPresentation {
  if (report.hasPhoto) return "image"
  switch (report.evidence) {
    case "none":
      return "label"
    case "receipt":
    case "board":
      return "removed"
    default: {
      const _exhaustive: never = report.evidence
      return _exhaustive
    }
  }
}

function groupCities(rows: readonly PublicReport[], nameOf: (placeCode: string) => string): CitySummary[] {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.placeCode, (counts.get(row.placeCode) ?? 0) + 1)
  return [...counts.entries()]
    .map(([placeCode, count]) => ({ placeCode, name: nameOf(placeCode), count }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
}

function cityMediansOf(
  rows: readonly PublicReport[],
  nameOf: (placeCode: string) => string,
): { name: string; median: number }[] {
  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const prices = groups.get(row.placeCode)
    if (prices) prices.push(row.price)
    else groups.set(row.placeCode, [row.price])
  }
  return [...groups.entries()].map(([placeCode, prices]) => ({
    name: nameOf(placeCode),
    median: medianRounded(prices),
  }))
}
