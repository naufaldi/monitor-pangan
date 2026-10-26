import { useCallback, useEffect, useMemo, useState } from "react"
import { createFileRoute, useRouterState } from "@tanstack/react-router"
import { Button, PageHeader, PageShell, StickyToolbar, StatusMessage } from "@monitor-pangan/ui"

import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { DatePicker } from "#/components/DatePicker.tsx"
import { MapView } from "#/components/MapView.tsx"
import { PriceTable } from "#/components/PriceTable.tsx"
import { ProvincePanel } from "#/components/ProvincePanel.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { fetchSnapshot } from "#/data/api-client.ts"
import { usePriceRequest } from "#/data/price-request.ts"
import { isSnapshotLoaded, latestLiveDate, provider, type Snapshot } from "#/data/provider.ts"
import { usePageSourceNote, useVintage } from "#/data/vintage.tsx"
import { homeSelectedDate, parseHomeSearch } from "#/lib/commodity-search.ts"
import { formatDateLong, formatPrice } from "#/lib/format.ts"
import { seoLinks, seoMeta, seoScripts } from "#/seo.ts"

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: seoMeta("home"),
    links: seoLinks("home"),
    scripts: seoScripts("home"),
  }),
  validateSearch: (search: Record<string, unknown>) => parseHomeSearch(search),
  component: HomePage,
})

function HomePage() {
  const rev = useVintage()
  const dates = useMemo(() => provider.dates(), [rev])
  const provinces = useMemo(() => provider.provinces(), [])
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const rawDate = useRouterState({ select: (state) => state.location.search.tanggal })
  const date = homeSelectedDate(search, dates, latestLiveDate())
  const sourceNote = usePageSourceNote(date)
  useEffect(() => {
    if (rawDate != null && parseHomeSearch({ tanggal: rawDate }, dates).tanggal == null) {
      void navigate({ replace: true, search: (previous) => ({ ...previous, tanggal: undefined }) })
    }
  }, [rawDate, dates, navigate])
  const commodityId = search.komoditas ?? COMMODITIES[0]?.id ?? ""
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const setCommodityId = (id: string) => {
    setSelectedCode(null)
    void navigate({ search: (prev) => ({ ...prev, komoditas: id }) })
  }

  const cached = useMemo(
    () => isSnapshotLoaded(date, commodityId) ? provider.snapshot(date, commodityId) : null,
    [date, commodityId, rev],
  )
  const load = useCallback(() => fetchSnapshot(date, commodityId), [date, commodityId])
  const { request, retry } = usePriceRequest(`${date}:${commodityId}:${rev}`, cached, load)
  const hints = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of COMMODITIES) {
      if (!isSnapshotLoaded(date, c.id)) continue
      const average = provider.snapshot(date, c.id).nationalAvg
      if (average != null) map.set(c.id, formatPrice(average, c.unit))
    }
    if (request.status === "ready" && request.data.nationalAvg != null) {
      map.set(commodityId, formatPrice(request.data.nationalAvg, request.data.commodity.unit))
    }
    return map
  }, [date, rev, request, commodityId])

  return (
    <PageShell>
      <PageHeader title="Peta harga pangan" visuallyHidden />
      <StickyToolbar>
        <div className="min-w-52 flex-1">
          <CommoditySelect
            commodities={COMMODITIES}
            value={commodityId}
            onChange={setCommodityId}
            hintFor={(c) => hints.get(c.id)}
          />
        </div>
        <DatePicker
          dates={dates}
          value={date}
          onChange={(next) => {
            void navigate({ search: (previous) => ({ ...previous, tanggal: next === latestLiveDate() ? undefined : next }) })
          }}
        />
      </StickyToolbar>

      {request.status === "loading" ? (
        <StatusMessage tone="loading" title="Memuat harga…">Mengambil harga PIHPS untuk {formatDateLong(date)}.</StatusMessage>
      ) : request.status === "error" ? (
        <StatusMessage tone="error" title={request.kind === "coverage" ? "Riwayat harga belum tersedia" : "Harga gagal dimuat"}
          action={<Button onClick={retry}>Coba lagi</Button>}>
          {request.kind === "coverage" ? "Cakupan survei untuk pilihan ini belum dapat dipastikan." : "Periksa koneksi lalu coba lagi."}
        </StatusMessage>
      ) : request.data.pricedCount === 0 ? (
        <StatusMessage tone="empty" title="Tidak ada data">Survei PIHPS tidak memuat harga untuk tanggal dan komoditas ini.</StatusMessage>
      ) : (
        <HomeSnapshot snapshotKey={request.key} snapshot={request.data} provinces={provinces} selectedCode={selectedCode} onSelect={setSelectedCode} />
      )}

      <footer className="pb-6 text-xs text-slate">
        Peta: GeoJSON indonesia-geodata (MIT). {request.status === "ready" ? sourceNote : `Tanggal dipilih: ${formatDateLong(date)}. Harga belum dimuat.`} Sumber resmi: Panel Harga
        Badan Pangan Nasional dan PIHPS Bank Indonesia.
      </footer>
    </PageShell>
  )
}

function HomeSnapshot({ snapshotKey, snapshot, provinces, selectedCode, onSelect }: {
  snapshotKey: string
  snapshot: Snapshot
  provinces: { code: string; name: string }[]
  selectedCode: string | null
  onSelect: (code: string | null) => void
}) {
  const selected = provinces.find((province) => province.code === selectedCode) ?? null
  const selectedPrice = snapshot.rows.find((row) => row.regionCode === selectedCode)?.price ?? null
  const prices = snapshot.rows.flatMap((row) => row.price == null ? [] : [row.price])
  const min = prices.length > 0 ? Math.min(...prices) : null
  const max = prices.length > 0 ? Math.max(...prices) : null
  return <>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MapView
              snapshotKey={snapshotKey}
              prices={snapshot.rows}
              average={snapshot.nationalAvg}
              selectedCode={selectedCode}
              onSelect={onSelect}
            />
          </div>
          <ProvincePanel
            commodityName={snapshot.commodity.name}
            provinceName={selected?.name ?? null}
            price={selectedPrice}
            average={snapshot.nationalAvg}
            min={min}
            max={max}
            unit={snapshot.commodity.unit}
            date={snapshot.date}
          />
        </div>

        <PriceTable
          commodityName={snapshot.commodity.name}
          date={snapshot.date}
          rows={snapshot.rows.map((r) => ({
            ...r,
            name: provinces.find((p) => p.code === r.regionCode)?.name ?? r.regionCode,
          }))}
          unit={snapshot.commodity.unit}
          average={snapshot.nationalAvg}
          selectedCode={selectedCode}
          onSelect={onSelect}
        />
  </>
}
