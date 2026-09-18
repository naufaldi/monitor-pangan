import type { TrendDirection, TrendPoint } from "#/data/provider.ts"
import { trendDirection } from "#/lib/format.ts"

export type PricedPoint = {
  date: string
  price: number
}

export type ChartStrip = {
  kind: "empty" | "single" | "range"
  sekarang: PricedPoint | null
  delta: { pct: number; rp: number; direction: TrendDirection } | null
  termurah: PricedPoint | null
  termahal: PricedPoint | null
}

export type ChartMove = {
  from: PricedPoint
  to: PricedPoint
  pct: number
  rp: number
}

export type ChartHighlights = {
  naikTerbesar: ChartMove | null
  turunTerbesar: ChartMove | null
  terakhir: ChartMove | null
}

/** Keep only observed positive prices. Zeros and gaps are not extrema. */
export function realPoints(points: TrendPoint[]): PricedPoint[] {
  return points.filter((point): point is PricedPoint => point.price > 0)
}

/** Summary strip from real endpoints only. Missing ends never invent Δ. */
export function chartStrip(points: TrendPoint[]): ChartStrip {
  const real = realPoints(points)
  if (real.length === 0) {
    return {
      kind: "empty",
      sekarang: null,
      delta: null,
      termurah: null,
      termahal: null,
    }
  }
  const sekarang = real[real.length - 1]!
  if (real.length === 1) {
    return {
      kind: "single",
      sekarang,
      delta: null,
      termurah: null,
      termahal: null,
    }
  }
  const first = real[0]!
  let termurah = first
  let termahal = first
  for (const point of real) {
    if (point.price < termurah.price) termurah = point
    if (point.price > termahal.price) termahal = point
  }
  const rp = sekarang.price - first.price
  const pct = (rp / first.price) * 100
  return {
    kind: "range",
    sekarang,
    delta: { pct, rp, direction: trendDirection(pct) },
    termurah,
    termahal,
  }
}

function consecutiveMoves(points: TrendPoint[]): ChartMove[] {
  const real = realPoints(points)
  const moves: ChartMove[] = []
  for (let i = 1; i < real.length; i++) {
    const from = real[i - 1]!
    const to = real[i]!
    const rp = to.price - from.price
    const pct = (rp / from.price) * 100
    moves.push({ from, to, pct, rp })
  }
  return moves
}

/** Biggest up, biggest down, and last move between consecutive real points. */
export function chartHighlights(points: TrendPoint[]): ChartHighlights {
  const moves = consecutiveMoves(points)
  let naikTerbesar: ChartMove | null = null
  let turunTerbesar: ChartMove | null = null
  for (const move of moves) {
    if (move.pct > 0 && (naikTerbesar == null || move.pct > naikTerbesar.pct)) {
      naikTerbesar = move
    }
    if (move.pct < 0 && (turunTerbesar == null || move.pct < turunTerbesar.pct)) {
      turunTerbesar = move
    }
  }
  return {
    naikTerbesar,
    turunTerbesar,
    terakhir: moves[moves.length - 1] ?? null,
  }
}

/** Copy for a province series that is missing or too sparse to chart honestly. */
export function limitedProvinceCopy(provinceName: string): string {
  return `Data di ${provinceName} masih terbatas`
}

/** True when the selected series has far fewer real points than nasional. */
export function isThinProvince(
  selected: TrendPoint[] | null,
  national: TrendPoint[],
): boolean {
  if (selected == null) return false
  const n = realPoints(national).length
  const s = realPoints(selected).length
  return n > 0 && s < Math.max(2, Math.ceil(n * 0.25))
}
