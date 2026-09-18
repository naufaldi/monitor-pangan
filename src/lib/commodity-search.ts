import { COMMODITIES } from "#/data/catalog.ts"

export type CommoditySearch = {
  komoditas?: string
}

/** Keep only a known commodity id from the URL search object. */
export function parseCommoditySearch(search: Record<string, unknown>): CommoditySearch {
  const raw = search.komoditas
  if (typeof raw !== "string") return {}
  const known = COMMODITIES.some((c) => c.id === raw)
  return known ? { komoditas: raw } : {}
}
