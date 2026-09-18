import type { TrendResolution } from "#/data/provider.ts"

export type TimeframeId = "7d" | "1m" | "1y" | "all"

export type TimeframeChip = {
  id: TimeframeId
  label: string
  days: number
  resolution: TrendResolution
}

export const TIMEFRAMES: readonly TimeframeChip[] = [
  { id: "7d", label: "7 hari", days: 7, resolution: "day" },
  { id: "1m", label: "1 bulan", days: 30, resolution: "day" },
  { id: "1y", label: "1 tahun", days: 365, resolution: "week" },
  { id: "all", label: "Semua", days: Number.MAX_SAFE_INTEGER, resolution: "month" },
]

export const DEFAULT_TIMEFRAME: TimeframeId = "all"

/** Look up a chip by id. */
export function timeframeById(id: string): TimeframeChip | undefined {
  return TIMEFRAMES.find((chip) => chip.id === id)
}

/** Last N live dates already in the series — no invented calendar days. */
export function windowRange(
  dates: string[],
  days: number,
): { from: string; to: string } {
  if (dates.length === 0) return { from: "", to: "" }
  const window = dates.slice(-days)
  return { from: window[0] ?? "", to: dates[dates.length - 1] ?? "" }
}
