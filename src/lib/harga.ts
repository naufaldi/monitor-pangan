/** Nearest-rupiah mean. An empty set has no mean. */
export function meanRupiah(prices: readonly number[]): number | null {
  if (prices.length === 0) return null
  const sum = prices.reduce((total, price) => total + price, 0)
  return Math.round(sum / prices.length)
}

/** Earlier hari perdagangan in an ascending date list. */
export function previousTradingDate(dates: readonly string[], date: string): string | null {
  let previous: string | null = null
  for (const candidate of dates) {
    if (candidate >= date) break
    previous = candidate
  }
  return previous
}

/**
 * Same calendar date one year earlier, or the latest date on or before it.
 * Dates must be ascending.
 */
export function yearAgoDate(dates: readonly string[], date: string): string | null {
  const target = shiftYears(date, -1)
  if (target == null) return null
  let anchor: string | null = null
  for (const candidate of dates) {
    if (candidate > target) break
    anchor = candidate
  }
  return anchor
}

/** Previous date in the list for which `hasHarga` is true. */
export function previousDateWithHarga(
  dates: readonly string[],
  date: string,
  hasHarga: (candidate: string) => boolean,
): string | null {
  let previous: string | null = null
  for (const candidate of dates) {
    if (candidate >= date) break
    if (hasHarga(candidate)) previous = candidate
  }
  return previous
}

export type AnchorChange = {
  pct: number
  anchorDate: string
  overlap: number
  surveyed: number
}

/** Percent change for one province. Missing harga on either day has no change. */
export function provinceChange(
  today: number | null | undefined,
  anchor: number | null | undefined,
  anchorDate: string,
): AnchorChange | null {
  if (today == null || anchor == null || anchor === 0) return null
  return {
    pct: ((today - anchor) / anchor) * 100,
    anchorDate,
    overlap: 1,
    surveyed: 1,
  }
}

/** National percent from provinces priced on both days. */
export function nationalChange(
  today: ReadonlyMap<string, number | null>,
  anchor: ReadonlyMap<string, number | null>,
  anchorDate: string,
): AnchorChange | null {
  let surveyed = 0
  const both: string[] = []
  for (const [code, price] of today) {
    if (price == null) continue
    surveyed += 1
    const earlier = anchor.get(code)
    if (earlier == null) continue
    both.push(code)
  }
  if (both.length === 0) return null
  const todayMean = meanRupiah(both.map((code) => today.get(code) ?? 0))
  const anchorMean = meanRupiah(both.map((code) => anchor.get(code) ?? 0))
  if (todayMean == null || anchorMean == null || anchorMean === 0) return null
  return {
    pct: ((todayMean - anchorMean) / anchorMean) * 100,
    anchorDate,
    overlap: both.length,
    surveyed,
  }
}

function shiftYears(iso: string, delta: number): string | null {
  const [year, month, day] = iso.split("-").map(Number)
  if (year == null || month == null || day == null) return null
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const shifted = new Date(Date.UTC(year + delta, month - 1, day))
  if (shifted.getUTCMonth() !== month - 1) shifted.setUTCDate(0)
  return shifted.toISOString().slice(0, 10)
}
