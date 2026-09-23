export const PRICE_BANDS = [
  { below: 0.9, color: "#00714c", label: "Jauh di bawah rata-rata" },
  { below: 0.97, color: "#00bd7d", label: "Di bawah rata-rata" },
  { below: 1.03, color: "#eab308", label: "Sekitar rata-rata" },
  { below: 1.1, color: "#f97316", label: "Di atas rata-rata" },
  { below: Number.POSITIVE_INFINITY, color: "#dc2626", label: "Jauh di atas rata-rata" },
] as const

export function provinceFill(
  price: number | null | undefined,
  average: number,
): { fillColor: string; fillOpacity: number } {
  if (price == null) return { fillColor: "#1a1c16", fillOpacity: 0.9 }
  const ratio = average === 0 ? 1 : price / average
  const fillColor = PRICE_BANDS.find((band) => ratio < band.below)?.color ?? "#eab308"
  return { fillColor, fillOpacity: 0.65 }
}
