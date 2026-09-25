import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { DatePicker } from "#/components/DatePicker.tsx"
import { MapView } from "#/components/MapView.tsx"
import { PriceTable } from "#/components/PriceTable.tsx"
import { ProvincePanel } from "#/components/ProvincePanel.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { isBundledDate, latestLiveDate, pageSourceNote, priceAnchors, provider } from "#/data/provider.ts"
import { loadYearSeries } from "#/data/year-series.ts"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"
import { formatPrice } from "#/lib/format.ts"

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => parseCommoditySearch(search),
  component: HomePage,
})

function HomePage() {
  const dates = useMemo(() => provider.dates(), [])
  const provinces = useMemo(() => provider.provinces(), [])
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [date, setDate] = useState(() => {
    const live = latestLiveDate()
    return dates.includes(live) ? live : (dates[dates.length - 1] ?? "")
  })
  const commodityId = search.komoditas ?? COMMODITIES[0]?.id ?? ""
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [seriesTick, setSeriesTick] = useState(0)
  const [seriesReady, setSeriesReady] = useState(() => isBundledDate(date))

  useEffect(() => {
    const year = Number(date.slice(0, 4))
    if (!Number.isFinite(year)) return
    let cancel = false
    if (!isBundledDate(date)) setSeriesReady(false)
    const years = [year, year - 1].filter((value) => value >= 2017).map(String)
    void Promise.all(years.map((value) => loadYearSeries(value))).then(() => {
      if (cancel) return
      setSeriesTick((tick) => tick + 1)
      setSeriesReady(true)
    })
    return () => {
      cancel = true
    }
  }, [date])

  const setCommodityId = (id: string) => {
    setSelectedCode(null)
    void navigate({ search: (prev) => ({ ...prev, komoditas: id }) })
  }

  const snapshot = useMemo(
    () => provider.snapshot(date, commodityId),
    [date, commodityId, seriesTick],
  )
  const anchors = useMemo(
    () => priceAnchors(date, commodityId, selectedCode),
    [date, commodityId, selectedCode, seriesTick],
  )
  const hints = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of COMMODITIES) {
      const average = provider.snapshot(date, c.id).nationalAvg
      map.set(c.id, average == null ? "—" : formatPrice(average, c.unit))
    }
    return map
  }, [date, seriesTick])
  const selected = provinces.find((p) => p.code === selectedCode) ?? null
  const selectedPrice =
    selected != null
      ? (snapshot.rows.find((r) => r.regionCode === selected.code)?.price ?? null)
      : null
  const extremes = useMemo(() => {
    let min = Number.POSITIVE_INFINITY
    let max = 0
    for (const r of snapshot.rows) {
      if (r.price == null) continue
      if (r.price < min) min = r.price
      if (r.price > max) max = r.price
    }
    return {
      min: Number.isFinite(min) ? min : (snapshot.nationalAvg ?? 0),
      max: max > 0 ? max : (snapshot.nationalAvg ?? 0),
    }
  }, [snapshot])

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
        <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-52 flex-1">
              <CommoditySelect
                commodities={COMMODITIES}
                value={commodityId}
                onChange={setCommodityId}
                hintFor={(c) => hints.get(c.id)}
              />
            </div>
            <DatePicker dates={dates} value={date} onChange={setDate} />
          </div>
        </div>

        {!seriesReady ? <p className="text-sm text-slate">Memuat harga untuk tanggal ini.</p> : null}
        {seriesReady ? <>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MapView
              snapshotKey={`${date}:${commodityId}`}
              prices={snapshot.rows}
              average={snapshot.nationalAvg}
              selectedCode={selectedCode}
              onSelect={setSelectedCode}
            />
          </div>
          <ProvincePanel
            commodityName={snapshot.commodity.name}
            provinceName={selected?.name ?? null}
            price={selectedPrice}
            average={snapshot.nationalAvg}
            min={extremes.min}
            max={extremes.max}
            unit={snapshot.commodity.unit}
            date={date}
            harian={anchors.harian}
            tahunan={anchors.tahunan}
          />
        </div>

        <PriceTable
          commodityName={snapshot.commodity.name}
          date={date}
          rows={snapshot.rows.map((r) => ({
            ...r,
            name: provinces.find((p) => p.code === r.regionCode)?.name ?? r.regionCode,
          }))}
          unit={snapshot.commodity.unit}
          average={snapshot.nationalAvg}
          selectedCode={selectedCode}
          onSelect={setSelectedCode}
        />
        </> : null}

        <footer className="pb-6 text-xs text-slate">
          Peta: GeoJSON indonesia-geodata (MIT). {pageSourceNote(date)} Sumber resmi: Panel Harga
          Badan Pangan Nasional dan PIHPS Bank Indonesia.
        </footer>
    </main>
  )
}
