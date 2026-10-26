import { COMMODITIES } from "#/data/catalog.ts"
import { Schema } from "effect"
import { CivilDateSchema } from "#/data/price-schema.ts"
import { REGION_ROWS } from "#/data/pihps-catalog.ts"
import { provider } from "#/data/provider.ts"
import { TIMEFRAMES, type TimeframeId } from "./chart-window.ts"

export type CommoditySearch = {
  komoditas?: string
}

export type ProvinceSearch = CommoditySearch & { provinsi?: string }
export type HomeSearch = ProvinceSearch & { tanggal?: string }
export type TrendSearch = ProvinceSearch & { rentang?: TimeframeId }
export type OverviewSearch = CommoditySearch & { provinsi: string }

export const DEFAULT_PROVINCE = "31"
const ProvinceCodeSchema = Schema.String.pipe(Schema.filter((code) => REGION_ROWS.some(([region]) => region === code)))
const TimeframeSchema = Schema.Literal(...TIMEFRAMES.map((timeframe) => timeframe.id))

/** Geography is valid even when PIHPS has no observations for it. */
export function parseProvinceSearch(search: Record<string, unknown>): ProvinceSearch {
  const commodity = parseCommoditySearch(search)
  return Schema.is(ProvinceCodeSchema)(search.provinsi)
    ? { ...commodity, provinsi: search.provinsi }
    : commodity
}

export function parseTrendSearch(search: Record<string, unknown>): TrendSearch {
  const context = parseProvinceSearch(search)
  return Schema.is(TimeframeSchema)(search.rentang)
    ? { ...context, rentang: search.rentang }
    : context
}

export function parseOverviewSearch(search: Record<string, unknown>): OverviewSearch {
  const context = parseProvinceSearch(search)
  return { ...context, provinsi: context.provinsi ?? DEFAULT_PROVINCE }
}

/** Home alone owns a selectable civil-date search parameter. */
export function parseHomeSearch(search: Record<string, unknown>, dates: readonly string[] = provider.dates()): HomeSearch {
  const commodity = parseProvinceSearch(search)
  return Schema.is(CivilDateSchema)(search.tanggal) && dates.includes(search.tanggal)
    ? { ...commodity, tanggal: search.tanggal }
    : commodity
}

export function homeSelectedDate(search: HomeSearch, dates: readonly string[], latest: string): string {
  return search.tanggal != null && dates.includes(search.tanggal) ? search.tanggal : latest
}

/** Keep only a known commodity id from the URL search object. */
export function parseCommoditySearch(search: Record<string, unknown>): CommoditySearch {
  const raw = search.komoditas
  if (typeof raw !== "string") return {}
  const known = COMMODITIES.some((c) => c.id === raw)
  return known ? { komoditas: raw } : {}
}
