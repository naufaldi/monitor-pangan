import { Delta, Stat, StatList, StatusMessage, cardClass } from "@monitor-pangan/ui"
import type { PriceUnit } from "#/data/catalog.ts"
import type { ChartStrip } from "#/lib/chart-summary.ts"
import type { TrendResolution } from "#/data/provider.ts"
import { formatPct, formatPrice, formatRupiah, formatSeriesDate } from "#/lib/format.ts"

type ChartSummaryStripProps = {
  strip: ChartStrip
  unit: PriceUnit
  resolution: TrendResolution
  limitedCopy?: string | null
}

/** Four-callout strip above the chart: Terakhir, Perubahan, Termurah, Termahal. */
export function ChartSummaryStrip({ strip, unit, resolution, limitedCopy }: ChartSummaryStripProps) {
  if (strip.kind === "empty") {
    return (
      <section aria-label="Ringkasan grafik">
        <StatusMessage tone="empty" title={limitedCopy ?? "Belum ada data tren untuk rentang ini."} />
      </section>
    )
  }

  return (
    <section aria-label="Ringkasan grafik" className={cardClass("md")}>
      {limitedCopy != null ? <p className="mb-3 text-sm text-slate">{limitedCopy}</p> : null}
      <StatList columns={4}>
        <Stat
          label="Terakhir"
          value={formatPrice(strip.sekarang!.price, unit)}
          hint={formatSeriesDate(strip.sekarang!.date, resolution)}
        />
        {strip.delta != null ? (
          <Stat
            label="Perubahan"
            value={
              <Delta direction={strip.delta.direction} className="font-bold">
                {formatPct(strip.delta.pct)} · {formatRupiah(strip.delta.rp, true)}
              </Delta>
            }
          />
        ) : null}
        {strip.termurah != null ? (
          <Stat
            label="Termurah"
            value={formatPrice(strip.termurah.price, unit)}
            hint={formatSeriesDate(strip.termurah.date, resolution)}
          />
        ) : null}
        {strip.termahal != null ? (
          <Stat
            label="Termahal"
            value={formatPrice(strip.termahal.price, unit)}
            hint={formatSeriesDate(strip.termahal.date, resolution)}
          />
        ) : null}
      </StatList>
    </section>
  )
}
