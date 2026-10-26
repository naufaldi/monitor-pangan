import { color } from "@monitor-pangan/ui"
export const PRICE_BANDS = [
  { below: 0.9, color: color.leafDeep, label: "Jauh di bawah rata-rata" },
  { below: 0.97, color: color.leaf, label: "Di bawah rata-rata" },
  { below: 1.03, color: color.gold, label: "Sekitar rata-rata" },
  { below: 1.1, color: color.heat, label: "Di atas rata-rata" },
  { below: Number.POSITIVE_INFINITY, color: color.ember, label: "Jauh di atas rata-rata" },
] as const

export function provinceFill(
  price: number | null | undefined,
  average: number | null,
): { fillColor: string; fillOpacity: number } {
  if (price == null || average == null || average <= 0) return { fillColor: color.ink, fillOpacity: 0.9 }
  const ratio = price / average
  const fillColor = PRICE_BANDS.find((band) => ratio < band.below)?.color ?? color.gold
  return { fillColor, fillOpacity: 0.65 }
}
