import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ChartHighlights } from "#/components/ChartHighlights.tsx"
import { ChartSummaryStrip } from "#/components/ChartSummaryStrip.tsx"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { ChevronBadge } from "#/components/ChevronBadge.tsx"
import { MoversList, type MoverItem } from "#/components/MoversList.tsx"
import { TrendChart } from "#/components/TrendChart.tsx"
import { apiProvider } from "#/data/api-client.ts"
import { COMMODITIES } from "#/data/catalog.ts"
import { liveSurveyDates, pageSourceNote, provider, type TrendSeries } from "#/data/provider.ts"
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

type RemoteDaySeries =
  | { status: "loading" }
  | { status: "ready"; series: TrendSeries; source: "api" | "bundle" }
  | { status: "error" }

/** Commodity trend view with region filter and movers. */
function TrenPage() {
  const dates = useMemo(() => liveSurveyDates(), [])
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

  const series = useMemo(
    () =>
      provider.trend(commodityId, regionCode, {
        from,
        to,
        resolution: chip.resolution,
      }),
    [commodityId, regionCode, from, to, chip.resolution],
  )
  const [attempt, setAttempt] = useState(0)
  const [remoteDay, setRemoteDay] = useState<RemoteDaySeries>({ status: "loading" })
  useEffect(() => {
    if (chip.resolution !== "day") return
    let cancelled = false
    setRemoteDay({ status: "loading" })
    apiProvider.trend(commodityId, regionCode, { from, to }).then(
      (daySeries) => {
        if (!cancelled) setRemoteDay({ status: "ready", series: daySeries, source: "api" })
      },
      () => {
        if (cancelled) return
        const fallback = provider.trend(commodityId, regionCode, {
          from,
          to,
          resolution: "day",
        })
        setRemoteDay(
          fallback.national.length > 0
            ? { status: "ready", series: fallback, source: "bundle" }
            : { status: "error" },
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [commodityId, regionCode, from, to, chip.resolution, attempt])
  const dayLoading = chip.resolution === "day" && remoteDay.status === "loading"
  const dayError = chip.resolution === "day" && remoteDay.status === "error"
  const resolved =
    chip.resolution === "day"
      ? remoteDay.status === "ready"
        ? remoteDay.series
        : null
      : series
  const daySource = chip.resolution === "day" && remoteDay.status === "ready" ? remoteDay.source : null

  const province = provinces.find((p) => p.code === regionCode) ?? null
  const focusPoints =
    resolved == null
      ? []
      : resolved.selected != null && realPoints(resolved.selected).length > 0
        ? resolved.selected
        : resolved.national
  const strip = useMemo(() => chartStrip(focusPoints), [focusPoints])
  const highlights = useMemo(() => chartHighlights(focusPoints), [focusPoints])
  const limitedCopy =
    province != null &&
    resolved != null &&
    isThinProvince(resolved.selected, resolved.national)
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
    if (resolved == null) return []
    const selectedByDate = new Map((resolved.selected ?? []).map((p) => [p.date, p.price]))
    return resolved.national.map((point) => ({
      date: point.date,
      national: point.price,
      selected: selectedByDate.get(point.date),
    }))
  }, [resolved])
  const showSelectedColumn = resolved?.selected != null

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

      {daySource === "bundle" ? (
        <p className="text-xs text-slate">
          Mode luring: tren harian dari bundel 30 hari terakhir.
        </p>
      ) : null}
      {dayLoading || resolved == null ? (
        <div className={cardClass("lg", "animate-pulse")} aria-label="Memuat tren">
          <p className="text-sm text-slate">Memuat tren…</p>
          <div className="mt-4 h-64 rounded-lg bg-muted" />
        </div>
      ) : null}
      {dayError ? (
        <div className={cardClass("lg")}>
          <p className="text-base font-bold">Gagal memuat tren harian.</p>
          <p className="mt-1 text-sm text-slate">
            API tidak menjawab dan bundel luring tidak mencakup rentang ini.
          </p>
          <p className="mt-4">
            <Button variant="rect" onClick={() => setAttempt((n) => n + 1)}>
              Coba lagi
            </Button>
          </p>
        </div>
      ) : null}
      {resolved != null && !dayLoading && !dayError ? (
        <>
          <ChartSummaryStrip strip={strip} unit={resolved.unit} limitedCopy={limitedCopy} />
          <TrendChart series={resolved} />
          <ChartHighlights highlights={highlights} unit={resolved.unit} />
        </>
      ) : null}

      {tableRows.length > 0 && !dayLoading && !dayError ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate">Lihat semua</summary>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate">
                <th className="py-1 pr-2 font-semibold">Tanggal</th>
                <th className="py-1 pr-2 text-right font-semibold">Nasional</th>
                {showSelectedColumn ? (
                  <th className="py-1 text-right font-semibold">Provinsi</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.date} className="border-t border-hairline">
                  <td className="py-1 pr-2">{formatDateShort(row.date)}</td>
                  <td className="tabular-nums py-1 pr-2 text-right font-semibold">
                    {resolved != null ? formatPrice(row.national, resolved.unit) : null}
                  </td>
                  {showSelectedColumn ? (
                    <td className="tabular-nums py-1 text-right">
                      {row.selected == null || resolved == null
                        ? "–"
                        : formatPrice(row.selected, resolved.unit)}
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
        Tren dihitung dari rata-rata nasional per tanggal survei. {pageSourceNote()}
      </footer>
    </main>
  )
}
