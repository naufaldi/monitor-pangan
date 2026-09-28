import type { TrendDirection, TrendResolution } from "#/data/provider.ts"

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

const MONTHS_LONG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

/** Format a YYYY-MM-DD date as "16 September 2026". */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (y == null || m == null || d == null) return iso
  return `${d} ${MONTHS_LONG[m - 1] ?? m} ${y}`
}

/**
 * User-visible series date. Month buckets are calendar labels (`Sep 2026`),
 * not the 1st of the month, which is not a PIHPS survey day.
 */
export function formatSeriesDate(iso: string, resolution: TrendResolution): string {
  switch (resolution) {
    case "month":
      return formatMonthYear(iso)
    case "day":
    case "week":
      return formatDateShort(iso)
    default: {
      const _exhaustive: never = resolution
      return _exhaustive
    }
  }
}

/** Format a YYYY-MM-DD date as "Sep 2026" for long-range axes. */
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number)
  if (y == null || m == null) return iso
  return `${MONTHS[m - 1] ?? m} ${y}`
}

/** Format a signed rupiah delta as "+Rp 2.000" / "-Rp 500" / "Rp 0". */
export function formatRupiah(value: number, signed = false): string {
  const grouped = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.abs(value))
  const amount = `Rp ${grouped}`
  if (!signed || value === 0) return value < 0 ? `-${amount}` : amount
  return `${value > 0 ? "+" : "-"}${amount}`
}

/** Format a price as "Rp 35.550/kg". */
export function formatPrice(value: number, unit: "kg" | "liter"): string {
  return `${formatRupiah(value)}/${unit}`
}

export function formatAxisPrice(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(value))
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
