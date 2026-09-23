import { trendDirection } from "#/lib/format.ts"

export type MarkKind = "up" | "down" | "flat" | "gap"

export type SeriesMark = {
  index: number
  date: string
  kind: MarkKind
  price: number | null
}

export function seriesMarks(
  dates: readonly string[],
  prices: ReadonlyMap<string, number>,
): SeriesMark[] {
  const marks: SeriesMark[] = []
  let previous: number | null = null
  dates.forEach((date, index) => {
    const price = prices.get(date)
    if (price == null) {
      marks.push({ index, date, kind: "gap", price: null })
      return
    }
    const kind =
      previous == null || previous === 0
        ? "flat"
        : trendDirection(((price - previous) / previous) * 100)
    marks.push({ index, date, kind, price })
    previous = price
  })
  return marks
}

export function markPaint(kind: MarkKind): { fill: string; stroke: string } {
  switch (kind) {
    case "up":
      return { fill: "#dc2626", stroke: "#dc2626" }
    case "down":
      return { fill: "#00714c", stroke: "#00714c" }
    case "flat":
      return { fill: "#ffffff", stroke: "#1a1c16" }
    case "gap":
      return { fill: "#1a1c16", stroke: "#1a1c16" }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function plottedIndices(
  marks: readonly SeriesMark[],
  xAt: (index: number) => number,
  activeIndex: number | null,
  minSpacing = 12,
): number[] {
  if (marks.length === 0) return []
  let minGap = Number.POSITIVE_INFINITY
  for (let i = 1; i < marks.length; i++) {
    const gap = Math.abs(xAt(marks[i]!.index) - xAt(marks[i - 1]!.index))
    if (gap < minGap) minGap = gap
  }
  if (marks.length === 1 || minGap >= minSpacing) {
    return marks.map((mark) => mark.index)
  }

  const keep = new Set<number>()
  const priced = marks.filter((mark) => mark.price != null)
  const first = priced[0]
  const last = priced[priced.length - 1]
  if (first != null) keep.add(first.index)
  if (last != null) keep.add(last.index)
  for (const mark of marks) {
    if (mark.kind === "gap") keep.add(mark.index)
  }
  for (let i = 1; i < priced.length - 1; i++) {
    const prev = priced[i - 1]!.price!
    const price = priced[i]!.price!
    const next = priced[i + 1]!.price!
    if ((price < prev && price < next) || (price > prev && price > next)) {
      keep.add(priced[i]!.index)
    }
  }
  if (activeIndex != null) keep.add(activeIndex)
  return [...keep].sort((a, b) => a - b)
}

export function axisInset(labels: readonly string[]): number {
  const widest = labels.reduce((max, label) => Math.max(max, label.length), 0)
  return widest * 7 + 16
}
