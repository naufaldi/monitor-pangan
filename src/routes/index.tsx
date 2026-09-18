import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { DatePicker } from "#/components/DatePicker.tsx"
import { MapView } from "#/components/MapView.tsx"
import { PriceTable } from "#/components/PriceTable.tsx"
import { ProvincePanel } from "#/components/ProvincePanel.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { latestLiveDate, pageSourceNote, provider } from "#/data/provider.ts"
import { parsePageSearch } from "#/lib/commodity-search.ts"
import { formatPrice } from "#/lib/format.ts"

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => parsePageSearch(search),
  component: HomePage,
})

function HomePage() {
  const dates = useMemo(() => provider.dates(), [])
  const provinces = useMemo(() => provider.provinces(), [])
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const live = latestLiveDate()
  const fallback = dates.includes(live) ? live : (dates[dates.length - 1] ?? "")
  const date = search.tanggal != null && dates.includes(search.tanggal) ? search.tanggal : fallback
  const setDate = (next: string) => {
    void navigate({ search: (prev) => ({ ...prev, tanggal: next }) })
  }
  const commodityId = search.komoditas ?? COMMODITIES[0]?.id ?? ""
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const setCommodityId = (id: string) => {
    setSelectedCode(null)
    void navigate({ search: (prev) => ({ ...prev, komoditas: id }) })
  }

  const snapshot = useMemo(
    () => provider.snapshot(date, commodityId),
    [date, commodityId],
  )
  const hints = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of COMMODITIES) {
      const snap = provider.snapshot(date, c.id)
      map.set(c.id, snap.pricedCount === 0 ? "Tidak ada data" : formatPrice(snap.nationalAvg, c.unit))
    }
    return map
  }, [date])
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
      min: Number.isFinite(min) ? min : null,
      max: max > 0 ? max : null,
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
            pricedCount={snapshot.pricedCount}
            min={extremes.min}
            max={extremes.max}
            unit={snapshot.commodity.unit}
            date={date}
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

        <footer className="pb-6 text-xs text-slate">
          Peta: GeoJSON indonesia-geodata (MIT). {pageSourceNote()} Sumber resmi: Panel Harga
          Badan Pangan Nasional dan PIHPS Bank Indonesia.
        </footer>
    </main>
  )
}
