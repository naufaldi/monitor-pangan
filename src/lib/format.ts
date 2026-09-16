import type { TrendDirection } from "#/data/provider.ts"

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
]

/** Format a YYYY-MM-DD date as "16 Sep 2026". */
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (y == null || m == null || d == null) return iso
  return `${d} ${MONTHS[m - 1] ?? m} ${y}`
}

/** Format a price as "Rp 35.550/kg". */
export function formatPrice(value: number, unit: "kg" | "liter"): string {
  const grouped = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(value)
  return `Rp ${grouped}/${unit}`
}

/** Format a percent delta as "+1.2%", "-0.8%", or "0.0%". */
export function formatPct(value: number): string {
  if (Number(value.toFixed(1)) === 0) return "0.0%"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

/** Classify a percent change as up, down, or flat. */
export function trendDirection(changePct: number): TrendDirection {
  if (changePct > 0.05) return "up"
  if (changePct < -0.05) return "down"
  return "flat"
}
