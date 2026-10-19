import type { PriceRow } from "./provider.ts"

/** A missing or invalid observation never contributes a zero to the mean. */
export function summarizePrices(
  rows: readonly PriceRow[],
): { nationalAvg: number | null; pricedCount: number } {
  const prices = rows
    .map((row) => row.price)
    .filter((price): price is number => price != null && Number.isFinite(price) && price > 0)
  return {
    nationalAvg: prices.length === 0
      ? null
      : Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length / 50) * 50,
    pricedCount: prices.length,
  }
}
