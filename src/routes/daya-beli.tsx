import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@monitor-pangan/ui"

import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { DayaBeliTable } from "#/components/DayaBeliTable.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import {
  dataBadge,
  latestLiveDate,
  liveSurveyDates,
  pageSourceNote,
  provider,
} from "#/data/provider.ts"
import { UMP_2026, UMP_LAST_VERIFIED, UMP_YEAR } from "#/data/wages.ts"
import {
  buildAffordabilityRows,
  sortAffordability,
  type AffordabilitySort,
} from "#/lib/daya-beli.ts"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"
import { formatDateShort } from "#/lib/format.ts"

export const Route = createFileRoute("/daya-beli")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => parseCommoditySearch(search),
  component: DayaBeliPage,
})

/** Newest live survey day with at least one price for the commodity. */
function pinnedPriceDate(commodityId: string): string {
  const live = liveSurveyDates()
  for (let i = live.length - 1; i >= 0; i--) {
    const date = live[i]!
    const snapshot = provider.snapshot(date, commodityId)
    if (snapshot.rows.some((r) => r.price != null)) return date
  }
  return latestLiveDate()
}

function DayaBeliPage() {
  const provinces = useMemo(() => provider.provinces(), [])
  const wages = useMemo(
    () => new Map(UMP_2026.map((w) => [w.regionCode, w.amountRpPerBulan])),
    [],
  )
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const commodityId = search.komoditas ?? COMMODITIES[0]?.id ?? ""
  const commodity =
    COMMODITIES.find((c) => c.id === commodityId) ?? COMMODITIES[0]!
  const [sort, setSort] = useState<AffordabilitySort>("amount-desc")

  const setCommodityId = (id: string) => {
    void navigate({ search: (prev) => ({ ...prev, komoditas: id }) })
  }

  const priceDate = useMemo(() => pinnedPriceDate(commodity.id), [commodity.id])
  const snapshot = useMemo(
    () => provider.snapshot(priceDate, commodity.id),
    [priceDate, commodity.id],
  )
  const rows = useMemo(() => {
    const prices = new Map(snapshot.rows.map((r) => [r.regionCode, r.price]))
    return sortAffordability(
      buildAffordabilityRows({
        provinces,
        wages,
        prices,
        unit: commodity.unit,
      }),
      sort,
    )
  }, [provinces, wages, snapshot, commodity.unit, sort])

  const priceYear = Number(priceDate.slice(0, 4))
  const showStaleBanner = priceYear !== UMP_YEAR
  const isSample = dataBadge(latestLiveDate()) === "Data contoh"

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <CommoditySelect
              commodities={COMMODITIES}
              value={commodity.id}
              onChange={setCommodityId}
            />
          </div>
          <Badge tone="neutral">UMP {UMP_YEAR} pekerja formal</Badge>
        </div>
      </div>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-bold">Daya beli {commodity.name}</h2>
        <p className="text-sm font-semibold">
          Ilustrasi daya beli pekerja formal — bukan pengukuran upah harian.
        </p>
        <p className="text-sm text-slate">
          N {commodity.unit} = UMP {UMP_YEAR} per provinsi ÷ harga rata-rata
          provinsi {formatDateShort(priceDate)} (PIHPS eceran). Harga =
          rata-rata kab/kota yang disurvei, bukan harga di tiap kab/kota.
        </p>
        <p className="text-sm text-slate">
          UMP hanya berlaku bagi pekerja formal. Sel kosong = data tidak
          tersedia (termasuk Papua pecahan 93–96), bukan nol.
        </p>
        <p className="text-xs text-slate">
          UMP {UMP_YEAR} terakhir diverifikasi {formatDateShort(UMP_LAST_VERIFIED)}.
        </p>
        {showStaleBanner ? (
          <p className="text-sm font-semibold text-ember">
            UMP {UMP_YEAR} dipadukan dengan harga {priceYear} — perbandingan
            antar-tahun, bukan daya beli bulan berjalan.
          </p>
        ) : null}
      </section>

      {isSample ? (
        <p className="text-sm text-slate">{pageSourceNote()} Tabel daya beli
        disembunyikan untuk data contoh.</p>
      ) : (
        <DayaBeliTable
          commodityName={commodity.name}
          unit={commodity.unit}
          wageYear={UMP_YEAR}
          priceDate={priceDate}
          rows={rows}
          sort={sort}
          onSortChange={setSort}
        />
      )}

      <footer className="pb-6 text-xs text-slate">
        Upah: UMP {UMP_YEAR} tiap provinsi (Kepgub). {pageSourceNote()}
      </footer>
    </main>
  )
}
