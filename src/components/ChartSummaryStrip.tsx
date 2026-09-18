import { cardClass } from "@monitor-pangan/ui"
import type { PriceUnit } from "#/data/catalog.ts"
import type { TrendDirection } from "#/data/provider.ts"
import type { ChartStrip } from "#/lib/chart-summary.ts"
import { formatDateShort, formatPct, formatPrice, formatRupiah } from "#/lib/format.ts"

type ChartSummaryStripProps = {
  strip: ChartStrip
  unit: PriceUnit
  limitedCopy?: string | null
}

function directionClass(direction: TrendDirection): string {
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

function directionMark(direction: TrendDirection): string {
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

/** Four-callout strip above the chart: Sekarang, Δ range, Termurah, Termahal. */
export function ChartSummaryStrip({ strip, unit, limitedCopy }: ChartSummaryStripProps) {
  if (strip.kind === "empty") {
    return (
      <section aria-label="Ringkasan grafik" className={cardClass("md")}>
        <p className="text-sm text-slate">{limitedCopy ?? "Belum ada data tren untuk rentang ini."}</p>
      </section>
    )
  }

  return (
    <section aria-label="Ringkasan grafik" className={cardClass("md")}>
      {limitedCopy != null ? <p className="mb-3 text-sm text-slate">{limitedCopy}</p> : null}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-slate">Sekarang</dt>
          <dd className="tabular-nums text-sm font-bold">{formatPrice(strip.sekarang!.price, unit)}</dd>
          <dd className="tabular-nums text-xs text-slate">{formatDateShort(strip.sekarang!.date)}</dd>
        </div>
        {strip.delta != null ? (
          <div>
            <dt className="text-xs font-semibold text-slate">Δ range</dt>
            <dd className={`tabular-nums text-sm font-bold ${directionClass(strip.delta.direction)}`}>
              <span aria-hidden="true">{directionMark(strip.delta.direction)} </span>
              {formatPct(strip.delta.pct)} · {formatRupiah(strip.delta.rp, true)}
            </dd>
          </div>
        ) : null}
        {strip.termurah != null ? (
          <div>
            <dt className="text-xs font-semibold text-slate">Termurah</dt>
            <dd className="tabular-nums text-sm font-bold">{formatPrice(strip.termurah.price, unit)}</dd>
            <dd className="tabular-nums text-xs text-slate">{formatDateShort(strip.termurah.date)}</dd>
          </div>
        ) : null}
        {strip.termahal != null ? (
          <div>
            <dt className="text-xs font-semibold text-slate">Termahal</dt>
            <dd className="tabular-nums text-sm font-bold">{formatPrice(strip.termahal.price, unit)}</dd>
            <dd className="tabular-nums text-xs text-slate">{formatDateShort(strip.termahal.date)}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
