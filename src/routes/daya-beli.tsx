import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@monitor-pangan/ui"

import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { DayaBeliSummary } from "#/components/DayaBeliSummary.tsx"
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
import { affordabilityEnds, buildAffordabilityRows } from "#/lib/daya-beli.ts"
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
    if (snapshot.rows.some((row) => row.price != null)) return date
  }
  return latestLiveDate()
}

function DayaBeliPage() {
  const provinces = useMemo(() => provider.provinces(), [])
  const wages = useMemo(
    () => new Map(UMP_2026.map((wage) => [wage.regionCode, wage.amountRpPerBulan])),
    [],
  )
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const commodityId = search.komoditas ?? COMMODITIES[0]?.id ?? ""
  const commodity = COMMODITIES.find((item) => item.id === commodityId) ?? COMMODITIES[0]!
  const [switching, setSwitching] = useState(false)
  const switchTimer = useRef<number | null>(null)

  const setCommodityId = (id: string) => {
    if (id === commodity.id) return
    setSwitching(true)
    if (switchTimer.current != null) window.clearTimeout(switchTimer.current)
    switchTimer.current = window.setTimeout(() => {
      switchTimer.current = null
      void navigate({ search: (prev) => ({ ...prev, komoditas: id }) })
    }, 200)
  }

  useEffect(() => {
    setSwitching(false)
  }, [commodity.id])

  useEffect(() => {
    return () => {
      if (switchTimer.current != null) window.clearTimeout(switchTimer.current)
    }
  }, [])

  const priceDate = useMemo(() => pinnedPriceDate(commodity.id), [commodity.id])
  const snapshot = useMemo(
    () => provider.snapshot(priceDate, commodity.id),
    [priceDate, commodity.id],
  )
  const rows = useMemo(() => {
    const prices = new Map(snapshot.rows.map((row) => [row.regionCode, row.price]))
    return buildAffordabilityRows({
      provinces,
      wages,
      prices,
      unit: commodity.unit,
    })
  }, [provinces, wages, snapshot, commodity.unit])
  const ends = useMemo(() => affordabilityEnds(rows), [rows])
  const hints = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of COMMODITIES) {
      const date = pinnedPriceDate(item.id)
      const snap = provider.snapshot(date, item.id)
      const prices = new Map(snap.rows.map((row) => [row.regionCode, row.price]))
      const top = affordabilityEnds(
        buildAffordabilityRows({
          provinces,
          wages,
          prices,
          unit: item.unit,
        }),
      ).highest
      if (top?.amount != null) map.set(item.id, `${top.amount} ${item.unit}`)
    }
    return map
  }, [provinces, wages])

  const priceYear = Number(priceDate.slice(0, 4))
  const ranked = rows.filter((row) => row.amount != null).length
  const isSample = dataBadge(latestLiveDate()) === "Data contoh"

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <div className="sticky top-0 z-30 -mx-4 border-b border-hairline bg-canvas/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <CommoditySelect
              commodities={COMMODITIES}
              value={commodity.id}
              onChange={setCommodityId}
              hintFor={(item) => hints.get(item.id)}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {switching ? (
              <span role="status" className="text-sm font-semibold text-slate">
                Memuat…
              </span>
            ) : null}
            <Badge tone="neutral">UMP {UMP_YEAR} pekerja formal</Badge>
          </div>
        </div>
      </div>

      {isSample ? (
        <p className="text-sm text-slate">
          {pageSourceNote()} Tabel daya beli disembunyikan untuk data contoh.
        </p>
      ) : (
        <>
          <DayaBeliSummary
            commodityName={commodity.name}
            unit={commodity.unit}
            priceDate={priceDate}
            wageYear={UMP_YEAR}
            ranked={ranked}
            total={rows.length}
            highest={ends.highest}
            lowest={ends.lowest}
            stalePriceYear={priceYear !== UMP_YEAR ? priceYear : null}
            busy={switching}
          />

          <DayaBeliTable
            commodityName={commodity.name}
            unit={commodity.unit}
            wageYear={UMP_YEAR}
            priceDate={priceDate}
            rows={rows}
            busy={switching}
          />

          <section className="flex flex-col gap-2 text-sm">
            <p className="text-slate">
              N {commodity.unit} = UMP {UMP_YEAR} per provinsi ÷ harga rata-rata
              provinsi {formatDateShort(priceDate)} (PIHPS eceran). Harga =
              rata-rata kab/kota yang disurvei, bukan harga di tiap kab/kota.
            </p>
            <p className="text-slate">
              UMP hanya berlaku bagi pekerja formal. Sel kosong = data tidak
              tersedia (termasuk Papua pecahan 93–96), bukan nol.
            </p>
            <p className="text-xs text-slate">
              UMP {UMP_YEAR} terakhir diverifikasi {formatDateShort(UMP_LAST_VERIFIED)}.
            </p>
          </section>
        </>
      )}

      <footer className="pb-6 text-xs text-slate">
        Upah: UMP {UMP_YEAR} tiap provinsi (Kepgub). {pageSourceNote()}
      </footer>
    </main>
  )
}
