import type { FreshPayload } from "./fresh-payload.ts"

/**
 * Last live survey day baked into `snapshot.gen.ts`.
 * Days after this come from D1, not from a rebuild.
 */
export const STATIC_LIVE_THROUGH = "2026-09-16"

type FreshState = {
  readonly latestDate: string
  readonly dates: readonly string[]
  readonly prices: Readonly<Record<string, number>>
}

let current: FreshState | null = null

/** Merge PIHPS rows newer than the baked snapshot. Empty input clears the overlay. */
export function applyFreshPrices(payload: FreshPayload): void {
  const dates = payload.dates
    .filter(
      (date) =>
        date > STATIC_LIVE_THROUGH &&
        Object.keys(payload.prices).some((key) => key.startsWith(`${date}:`)),
    )
    .sort()
  if (dates.length === 0) {
    current = null
    return
  }
  current = {
    latestDate: dates[dates.length - 1] ?? "",
    dates,
    prices: payload.prices,
  }
}

/** Drop the overlay so the baked snapshot is authoritative again. */
export function clearFreshPrices(): void {
  current = null
}

/** Survey days supplied by the live store, oldest first. */
export function freshDates(): readonly string[] {
  return current == null ? [] : current.dates
}

/** Missing or invalid observations never escape the overlay as displayed prices. */
export function freshPrice(key: string): number | undefined {
  const price = current?.prices[key]
  return price != null && Number.isFinite(price) && price > 0 ? price : undefined
}
