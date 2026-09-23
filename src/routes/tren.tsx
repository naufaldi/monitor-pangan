import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { AnchorChanges } from "#/components/AnchorChanges.tsx"
import { ChartHighlights } from "#/components/ChartHighlights.tsx"
import { ChartSummaryStrip } from "#/components/ChartSummaryStrip.tsx"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { ChevronBadge } from "#/components/ChevronBadge.tsx"
import { MoversList, type MoverItem } from "#/components/MoversList.tsx"
import { TrendChart } from "#/components/TrendChart.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { liveSurveyDates, pageSourceNote, priceAnchors, provider } from "#/data/provider.ts"
import { loadYearSeries } from "#/data/year-series.ts"
import {
  chartHighlights,
  chartStrip,
  isThinProvince,
  limitedProvinceCopy,
  realPoints,
} from "#/lib/chart-summary.ts"
import { DEFAULT_TIMEFRAME, TIMEFRAMES, type TimeframeId, timeframeById, windowRange } from "#/lib/chart-window.ts"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"
import { formatDateShort, formatPct, formatPrice } from "#/lib/format.ts"
import { Button, Select, cardClass } from "@monitor-pangan/ui"

export const Route = createFileRoute("/tren")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => parseCommoditySearch(search),
  component: TrenPage,
})

/** Commodity trend view with region filter and movers. */
function TrenPage() {
  const dates = useMemo(() => liveSurveyDates(), [])
  const provinces = useMemo(() => provider.provinces(), [])
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const commodityId = search.komoditas ?? COMMODITIES[0]?.id ?? ""
  const [regionCode, setRegionCode] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<TimeframeId>(DEFAULT_TIMEFRAME)
  const [seriesTick, setSeriesTick] = useState(0)
  const anchorDate = dates[dates.length - 1] ?? ""
  const chip = timeframeById(timeframe) ?? timeframeById(DEFAULT_TIMEFRAME) ?? TIMEFRAMES[3]!
  const { from, to } = windowRange(dates, chip.days)

  useEffect(() => {
    const years = new Set<string>()
    for (const iso of [anchorDate, from]) {
      const year = Number(iso.slice(0, 4))
      if (!Number.isFinite(year)) continue
      if (year >= 2017) years.add(String(year))
      if (year - 1 >= 2017) years.add(String(year - 1))
    }
    if (years.size === 0) return
    let cancel = false
    void Promise.all([...years].map((year) => loadYearSeries(year))).then(() => {
      if (!cancel) setSeriesTick((tick) => tick + 1)
    })
    return () => {
      cancel = true
    }
  }, [anchorDate, from])
  const dataSpan =
    dates.length > 0 ? `${formatDateShort(dates[0]!)} – ${formatDateShort(dates[dates.length - 1]!)}` : ""

  const setCommodityId = (id: string) => {
    void navigate({ search: (prev) => ({ ...prev, komoditas: id }) })
  }

  const series = useMemo(
    () =>
      provider.trend(commodityId, regionCode, {
        from,
        to,
        resolution: chip.resolution,
      }),
    [commodityId, regionCode, from, to, chip.resolution, seriesTick],
  )
  const anchors = useMemo(
    () => priceAnchors(anchorDate, commodityId, regionCode),
    [anchorDate, commodityId, regionCode, seriesTick],
  )

  const province = provinces.find((p) => p.code === regionCode) ?? null
  const focusPoints =
    series.selected != null && realPoints(series.selected).length > 0 ? series.selected : series.national
  const strip = useMemo(() => chartStrip(focusPoints), [focusPoints])
  const highlights = useMemo(() => chartHighlights(focusPoints), [focusPoints])
  const limitedCopy =
    province != null && isThinProvince(series.selected, series.national)
      ? limitedProvinceCopy(province.name)
      : null

  const moverRange = useMemo(() => {
    const r = provider.trend(COMMODITIES[0]?.id ?? "", null, { resolution: "month" }).range
    return `${formatDateShort(r.from)} – ${formatDateShort(r.to)}`
  }, [])

  const movers = useMemo<MoverItem[]>(
    () =>
      COMMODITIES.map((c) => {
        const s = provider.trend(c.id, null, { resolution: "month" })
        return {
          commodityId: c.id,
          name: c.name,
          unit: c.unit,
          lastPrice: s.national.at(-1)?.price ?? 0,
          changePct: s.changePct,
          direction: s.direction,
        }
      }),
    [],
  )
  const moverById = useMemo(() => new Map(movers.map((m) => [m.commodityId, m])), [movers])
  const tableRows = useMemo(() => {
    const selectedByDate = new Map((series.selected ?? []).map((p) => [p.date, p.price]))
    return series.national.map((point) => ({
      date: point.date,
      national: point.price,
      selected: selectedByDate.get(point.date),
    }))
  }, [series])

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <CommoditySelect
              commodities={COMMODITIES}
              value={commodityId}
              onChange={setCommodityId}
              hintFor={(c) => {
                const m = moverById.get(c.id)
                return m == null ? undefined : `${formatPrice(m.lastPrice, m.unit)} · ${formatPct(m.changePct)}`
              }}
            />
          </div>
          <div className="relative flex items-center">
            <Select
              value={regionCode ?? ""}
              onChange={(e) => setRegionCode(e.target.value === "" ? null : e.target.value)}
              aria-label="Provinsi"
              className="appearance-none pr-11 pl-3"
            >
              <option value="">Nasional</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </Select>
            <span className="absolute top-1/2 right-1 -translate-y-1/2">
              <ChevronBadge />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Rentang waktu">
            {TIMEFRAMES.map((t) => {
              const active = t.id === timeframe
              return (
                <Button
                  key={t.id}
                  variant="rect"
                  active={active}
                  onClick={() => setTimeframe(t.id)}
                  aria-pressed={active}
                >
                  {t.label}
                </Button>
              )
            })}
            {dataSpan !== "" ? (
              <span className="tabular-nums text-xs text-slate" aria-label="Rentang data tersedia">
                Data: {dataSpan}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <ChartSummaryStrip strip={strip} unit={series.unit} limitedCopy={limitedCopy} />
      <section className={cardClass("md")} aria-label="Perubahan harga">
        <AnchorChanges harian={anchors.harian} tahunan={anchors.tahunan} />
      </section>
      <TrendChart series={series} />
      <ChartHighlights highlights={highlights} unit={series.unit} />

      {tableRows.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate">Lihat semua</summary>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate">
                <th className="py-1 pr-2 font-semibold">Tanggal</th>
                <th className="py-1 pr-2 text-right font-semibold">Nasional</th>
                {series.selected != null ? (
                  <th className="py-1 text-right font-semibold">Provinsi</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.date} className="border-t border-hairline">
                  <td className="py-1 pr-2">{formatDateShort(row.date)}</td>
                  <td className="tabular-nums py-1 pr-2 text-right font-semibold">
                    {formatPrice(row.national, series.unit)}
                  </td>
                  {series.selected != null ? (
                    <td className="tabular-nums py-1 text-right">
                      {row.selected == null ? "–" : formatPrice(row.selected, series.unit)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <MoversList items={movers} activeId={commodityId} onSelect={setCommodityId} rangeLabel={moverRange} />

      <footer className="pb-6 text-xs text-slate">
        Tren dihitung dari rata-rata nasional per tanggal survei. {pageSourceNote(anchorDate)}
      </footer>
    </main>
  )
}
