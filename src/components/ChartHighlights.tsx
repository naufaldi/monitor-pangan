import { cardClass } from "@monitor-pangan/ui"
import type { PriceUnit } from "#/data/catalog.ts"
import type { ChartHighlights as Highlights, ChartMove } from "#/lib/chart-summary.ts"
import type { TrendResolution } from "#/data/provider.ts"
import { formatPct, formatRupiah, formatSeriesDate, trendDirection } from "#/lib/format.ts"

type ChartHighlightsProps = {
  highlights: Highlights
  unit: PriceUnit
  resolution: TrendResolution
}

function directionMark(pct: number): string {
  const direction = trendDirection(pct)
  switch (direction) {
    case "up":
      return "↑"
    case "down":
      return "↓"
    case "flat":
      return "→"
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

function directionClass(pct: number): string {
  const direction = trendDirection(pct)
  switch (direction) {
    case "up":
      return "text-ember"
    case "down":
      return "text-leaf-deep"
    case "flat":
      return "text-slate"
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

function MoveBody({ move, unit, resolution }: { move: ChartMove; unit: PriceUnit; resolution: TrendResolution }) {
  return (
    <>
      <p className={`tabular-nums mt-1 text-sm font-bold ${directionClass(move.pct)}`}>
        <span aria-hidden="true">{directionMark(move.pct)} </span>
        {formatPct(move.pct)} · {formatRupiah(move.rp, true)}/{unit}
      </p>
      <p className="tabular-nums text-xs text-slate">
        {formatSeriesDate(move.from.date, resolution)} → {formatSeriesDate(move.to.date, resolution)}
      </p>
    </>
  )
}

/** Three highlight cards: biggest up, biggest down, last change. */
export function ChartHighlights({ highlights, unit, resolution }: ChartHighlightsProps) {
  const cards: Array<{ title: string; move: ChartMove | null; empty: string }> = [
    { title: "Naik terbesar", move: highlights.naikTerbesar, empty: "Tidak ada kenaikan di rentang ini." },
    { title: "Turun terbesar", move: highlights.turunTerbesar, empty: "Tidak ada penurunan di rentang ini." },
    { title: "Terakhir", move: highlights.terakhir, empty: "Belum ada pergerakan." },
  ]
  return (
    <section aria-label="Sorotan pergerakan" className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <article key={card.title} className={cardClass("md")}>
          <h2 className="text-xs font-semibold text-slate">{card.title}</h2>
          {card.move == null ? (
            <p className="mt-1 text-sm text-slate">{card.empty}</p>
          ) : (
            <MoveBody move={card.move} unit={unit} resolution={resolution} />
          )}
        </article>
      ))}
    </section>
  )
}
