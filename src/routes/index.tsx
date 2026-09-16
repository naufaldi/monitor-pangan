import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { CommodityTabs } from "#/components/CommodityTabs.tsx"
import { DatePicker } from "#/components/DatePicker.tsx"
import { MapView } from "#/components/MapView.tsx"
import { PriceTable } from "#/components/PriceTable.tsx"
import { ProvincePanel } from "#/components/ProvincePanel.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { provider } from "#/data/provider.ts"

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomePage,
})

function HomePage() {
  const dates = useMemo(() => provider.dates(), [])
  const provinces = useMemo(() => provider.provinces(), [])
  const [date, setDate] = useState(dates[dates.length - 1] ?? "")
  const [commodityId, setCommodityId] = useState(COMMODITIES[0]?.id ?? "")
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const snapshot = useMemo(
    () => provider.snapshot(date, commodityId),
    [date, commodityId],
  )
  const selected = provinces.find((p) => p.code === selectedCode) ?? null
  const selectedPrice =
    selected != null
      ? (snapshot.rows.find((r) => r.regionCode === selected.code)?.price ?? null)
      : null

  return (
    <div className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-hairline bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Monitor Pangan</h1>
            <p className="text-sm text-slate">
              Harga pangan strategis Indonesia per provinsi
            </p>
          </div>
          <span className="ml-auto rounded-full bg-ember-soft px-3 py-1 text-xs font-semibold text-ember">
            Data contoh
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
        <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur">
          <CommodityTabs
            commodities={COMMODITIES}
            value={commodityId}
            onChange={(id) => {
              setCommodityId(id)
              setSelectedCode(null)
            }}
          />
          <div className="pt-2">
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
          Peta: GeoJSON indonesia-geodata (MIT). Angka di halaman ini data contoh
          untuk pengembangan UI — bukan data resmi. Sumber resmi: Panel Harga
          Badan Pangan Nasional dan PIHPS Bank Indonesia.
        </footer>
      </main>
    </div>
  )
}
