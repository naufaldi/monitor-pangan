import { useCallback, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ChartHighlights } from "#/components/ChartHighlights.tsx"
import { ChartSummaryStrip } from "#/components/ChartSummaryStrip.tsx"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { MoversList, type MoverItem } from "#/components/MoversList.tsx"
import { TrendChart } from "#/components/TrendChart.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { fetchTrend } from "#/data/api-client.ts"
import { usePriceRequest } from "#/data/price-request.ts"
import { isSnapshotLoaded, latestLiveDate, liveSurveyDates, provider } from "#/data/provider.ts"
import { usePageSourceNote, useVintage } from "#/data/vintage.tsx"
import {
  chartHighlights,
  chartStrip,
  isThinProvince,
  limitedProvinceCopy,
  realPoints,
} from "#/lib/chart-summary.ts"
import { DEFAULT_TIMEFRAME, TIMEFRAMES, type TimeframeId, timeframeById, windowRange } from "#/lib/chart-window.ts"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"
import { formatDateShort, formatPct, formatPrice, formatSeriesDate } from "#/lib/format.ts"
import { seoLinks, seoMeta, seoScripts } from "#/seo.ts"
import { Button, FieldSelect, PageHeader, PageShell, SegmentedControl, StickyToolbar, StatusMessage, tableClass, tdClass, thClass } from "@monitor-pangan/ui"

export const Route = createFileRoute("/tren")({
  ssr: false,
  head: () => ({
    meta: seoMeta("tren"),
    links: seoLinks("tren"),
    scripts: seoScripts("tren"),
  }),
  validateSearch: (search: Record<string, unknown>) => parseCommoditySearch(search),
  component: TrenPage,
})

/** Commodity trend view with region filter and movers. */
function TrenPage() {
  const rev = useVintage()
  const sourceNote = usePageSourceNote(latestLiveDate())
  const dates = useMemo(() => liveSurveyDates(), [rev])
  const provinces = useMemo(() => provider.provinces(), [])
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const commodityId = search.komoditas ?? COMMODITIES[0]?.id ?? ""
  const [regionCode, setRegionCode] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<TimeframeId>(DEFAULT_TIMEFRAME)
  const chip = timeframeById(timeframe) ?? timeframeById(DEFAULT_TIMEFRAME) ?? TIMEFRAMES[3]!
  const { from, to } = windowRange(dates, chip.days)
  const dataSpan =
    dates.length > 0 ? `${formatDateShort(dates[0]!)} – ${formatDateShort(dates[dates.length - 1]!)}` : ""

  const setCommodityId = (id: string) => {
    void navigate({ search: (prev) => ({ ...prev, komoditas: id }) })
  }

  const cached = useMemo(() => {
    const requestedDates = dates.filter((date) => date >= from && date <= to)
    const loaded = requestedDates.length > 0 && requestedDates.every((date) => isSnapshotLoaded(date, commodityId))
    return chip.resolution !== "day" || loaded
      ? provider.trend(commodityId, regionCode, { from, to, resolution: chip.resolution })
      : null
  }, [commodityId, regionCode, from, to, chip.resolution, dates, rev])
  const load = useCallback(() => fetchTrend(commodityId, regionCode, { from, to, resolution: chip.resolution }),
    [commodityId, regionCode, from, to, chip.resolution])
  const { request, retry } = usePriceRequest(`${commodityId}:${regionCode ?? ""}:${from}:${to}:${chip.resolution}:${rev}`, cached, load)
  const series = request.status === "ready" ? request.data : null

  const province = provinces.find((p) => p.code === regionCode) ?? null
  const focusPoints =
    series?.selected != null && realPoints(series.selected).length > 0 ? series.selected : series?.national ?? []
  const strip = useMemo(() => chartStrip(focusPoints), [focusPoints])
  const highlights = useMemo(() => chartHighlights(focusPoints), [focusPoints])
  const limitedCopy =
    province != null && series != null && isThinProvince(series.selected, series.national)
      ? limitedProvinceCopy(province.name)
      : null

  const moverRange = useMemo(() => {
    const r = provider.trend(COMMODITIES[0]?.id ?? "", null, { resolution: "month" }).range
    return `${formatDateShort(r.from)} – ${formatDateShort(r.to)}`
  }, [rev])

  const movers = useMemo<MoverItem[]>(
    () =>
      COMMODITIES.flatMap((c) => {
        const s = provider.trend(c.id, null, { resolution: "month" })
        const lastPrice = s.national.at(-1)?.price
        if (lastPrice == null) return []
        return [{
          commodityId: c.id,
          name: c.name,
          unit: c.unit,
          lastPrice,
          changePct: s.changePct,
          direction: s.direction,
        }]
      }),
    [rev],
  )
  const moverById = useMemo(() => new Map(movers.map((m) => [m.commodityId, m])), [movers])
  const tableRows = useMemo(() => {
    if (series == null) return []
    const selectedByDate = new Map((series.selected ?? []).map((p) => [p.date, p.price]))
    return series.national.map((point) => ({
      date: point.date,
      national: point.price,
      selected: selectedByDate.get(point.date),
    }))
  }, [series])

  return (
    <PageShell>
      <PageHeader title="Grafik tren harga" visuallyHidden />
      <StickyToolbar>
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
        <FieldSelect
          label="Provinsi"
          value={regionCode ?? ""}
          onChange={(e) => setRegionCode(e.target.value === "" ? null : e.target.value)}
          wrapperClassName="min-w-48"
        >
          <option value="">Nasional</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </FieldSelect>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Rentang waktu"
            options={TIMEFRAMES.map((t) => ({ value: t.id, label: t.label }))}
            value={timeframe}
            onChange={setTimeframe}
          />
          {dataSpan !== "" ? (
            <span className="tabular-nums text-xs text-slate" aria-label="Rentang data tersedia">
              Data: {dataSpan}
            </span>
          ) : null}
        </div>
      </StickyToolbar>

      {request.status === "loading" ? (
        <StatusMessage tone="loading" title="Memuat tren…">Mengambil seluruh harga PIHPS untuk rentang ini.</StatusMessage>
      ) : request.status === "error" ? (
        <StatusMessage tone="error" title={request.kind === "coverage" ? "Riwayat tren belum tersedia" : "Tren gagal dimuat"}
          action={<Button onClick={retry}>Coba lagi</Button>}>
          {request.kind === "coverage" ? "Cakupan survei untuk rentang ini belum dapat dipastikan." : "Periksa koneksi lalu coba lagi."}
        </StatusMessage>
      ) : series == null || series.national.length === 0 ? (
        <StatusMessage tone="empty" title="Tidak ada data">Survei PIHPS tidak memuat harga untuk rentang dan komoditas ini.</StatusMessage>
      ) : <>
      <ChartSummaryStrip
        strip={strip}
        unit={series.unit}
        limitedCopy={limitedCopy}
        resolution={series.range.resolution}
      />
      <TrendChart series={series} />
      <ChartHighlights highlights={highlights} unit={series.unit} resolution={series.range.resolution} />
      </>}

      {series != null && tableRows.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate">Lihat semua</summary>
          <div className="mt-2 overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass("start")}>Tanggal</th>
                  <th className={thClass("end")}>Nasional</th>
                  {series.selected != null ? (
                    <th className={thClass("end")}>Provinsi</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.date} className="border-t border-hairline">
                    <td className={tdClass("start")}>{formatSeriesDate(row.date, series.range.resolution)}</td>
                    <td className={tdClass("end", "font-semibold")}>
                      {formatPrice(row.national, series.unit)}
                    </td>
                    {series.selected != null ? (
                      <td className={tdClass("end")}>
                        {row.selected == null ? "–" : formatPrice(row.selected, series.unit)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <MoversList items={movers} activeId={commodityId} onSelect={setCommodityId} rangeLabel={moverRange} />

      <footer className="pb-6 text-xs text-slate">
        Tren dihitung dari rata-rata nasional per tanggal survei. {sourceNote}
      </footer>
    </PageShell>
  )
}
