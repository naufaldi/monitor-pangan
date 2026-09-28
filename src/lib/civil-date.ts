/** Days since Unix epoch for a civil YYYY-MM-DD, using Howard Hinnant's algorithm. */
function epochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  if (y == null || m == null || d == null) return 0
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Civil YYYY-MM-DD for a Unix epoch day. */
function isoFromEpochDay(day: number): string {
  const z = day + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  const year = y + (m <= 2 ? 1 : 0)
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** 0 = Monday … 6 = Sunday. 1970-01-01 was a Thursday. */
function weekdayMonday0(iso: string): number {
  return (epochDay(iso) + 3) % 7
}

/** Monday of the ISO week that contains this civil date. */
export function mondayOf(iso: string): string {
  return isoFromEpochDay(epochDay(iso) - weekdayMonday0(iso))
}

/** Calendar month bucket key, YYYY-MM-01. Not a PIHPS survey day. */
export function monthBucket(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Next civil day, with no clock and no timezone. */
export function nextIsoDay(iso: string): string {
  return isoFromEpochDay(epochDay(iso) + 1)
}

/** Monday–Friday. PIHPS does not survey Saturday or Sunday. */
export function isTradingDay(iso: string): boolean {
  return weekdayMonday0(iso) < 5
}

/** Inclusive trading days from `start` through `end`. */
export function tradingDaysFromThrough(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end && out.length < 4000) {
    if (isTradingDay(cur)) out.push(cur)
    cur = nextIsoDay(cur)
  }
  return out
}
