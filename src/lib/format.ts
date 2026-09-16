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
