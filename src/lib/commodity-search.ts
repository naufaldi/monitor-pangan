import { COMMODITIES } from "#/data/catalog.ts"

export type CommoditySearch = {
  komoditas?: string
}

export type PageSearch = {
  komoditas?: string
  tanggal?: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Keep only a known commodity id from the URL search object. */
export function parseCommoditySearch(search: Record<string, unknown>): CommoditySearch {
  const raw = search.komoditas
  if (typeof raw !== "string") return {}
  const known = COMMODITIES.some((c) => c.id === raw)
  return known ? { komoditas: raw } : {}
}

/** Keep a known commodity id plus a well-formed snapshot date. */
export function parsePageSearch(search: Record<string, unknown>): PageSearch {
  const parsed = parseCommoditySearch(search)
  const rawDate = search.tanggal
  if (typeof rawDate !== "string" || !DATE_PATTERN.test(rawDate)) return parsed
  return { ...parsed, tanggal: rawDate }
}
