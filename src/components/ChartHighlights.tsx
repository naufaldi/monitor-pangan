import { Delta, StatusMessage, cardClass, eyebrowClass } from "@monitor-pangan/ui"
import type { PriceUnit } from "#/data/catalog.ts"
import type { ChartHighlights as Highlights, ChartMove } from "#/lib/chart-summary.ts"
import type { TrendResolution } from "#/data/provider.ts"
import { formatPct, formatRupiah, formatSeriesDate, trendDirection } from "#/lib/format.ts"

type ChartHighlightsProps = {
  highlights: Highlights
  unit: PriceUnit
  resolution: TrendResolution
}

function MoveBody({ move, unit, resolution }: { move: ChartMove; unit: PriceUnit; resolution: TrendResolution }) {
  return (
    <>
      <p className="mt-1 text-sm">
        <Delta direction={trendDirection(move.pct)} className="font-bold">
          {formatPct(move.pct)} · {formatRupiah(move.rp, true)}/{unit}
        </Delta>
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
          <h3 className={eyebrowClass}>{card.title}</h3>
          {card.move == null ? (
            <StatusMessage tone="empty" title={card.empty} bare className="mt-1 px-0 py-0" />
          ) : (
            <MoveBody move={card.move} unit={unit} resolution={resolution} />
          )}
        </article>
      ))}
    </section>
  )
}
