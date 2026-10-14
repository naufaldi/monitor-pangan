import { parseCommoditySearch } from "#/lib/commodity-search.ts"

export type LaporanSearch = {
  outlet?: "ritel"
  komoditas?: string
  provinsi?: string
}

/**
 * Search for /laporan. Pasar is the default outlet and is left off the query
 * string, so the nav can open /laporan itself.
 */
export function parseLaporanSearch(search: Record<string, unknown>, provinceCodes: ReadonlySet<string>): LaporanSearch {
  const result: LaporanSearch = {}
  if (search.outlet === "ritel") result.outlet = "ritel"
  const commodity = parseCommoditySearch(search).komoditas
  if (commodity != null) result.komoditas = commodity
  if (typeof search.provinsi === "string" && provinceCodes.has(search.provinsi)) result.provinsi = search.provinsi
  return result
}
