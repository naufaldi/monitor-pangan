import { registerYearSeries, type YearSeriesFile } from "#/data/provider.ts"

const cache = new Map<string, YearSeriesFile | null>()

/** Fetch one year's daily series and register it for anchors and day charts. */
export async function loadYearSeries(year: string): Promise<void> {
  if (cache.has(year)) {
    const cached = cache.get(year)
    if (cached != null) registerYearSeries(cached)
    return
  }
  try {
    const response = await fetch(`/series/${year}.json`)
    if (!response.ok) {
      cache.set(year, null)
      return
    }
    const series = (await response.json()) as YearSeriesFile
    cache.set(year, series)
    registerYearSeries(series)
  } catch {
    cache.set(year, null)
  }
}
