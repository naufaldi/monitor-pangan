import { COMMODITIES } from "#/data/catalog.ts"
import { Schema } from "effect"
import { CivilDateSchema } from "#/data/price-schema.ts"
import { provider } from "#/data/provider.ts"

export type CommoditySearch = {
  komoditas?: string
}

export type HomeSearch = CommoditySearch & { tanggal?: string }

/** Home alone owns a selectable civil-date search parameter. */
export function parseHomeSearch(search: Record<string, unknown>, dates: readonly string[] = provider.dates()): HomeSearch {
  const commodity = parseCommoditySearch(search)
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
