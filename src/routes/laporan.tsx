import { useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { Button } from "@monitor-pangan/ui"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { LaporanList } from "#/components/LaporanList.tsx"
import { LaporanMap } from "#/components/LaporanMap.tsx"
import { LaporanProvince } from "#/components/LaporanProvince.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { fetchReports } from "#/data/laporan-client.ts"
import { EMPTY_WINDOW_COPY, NO_PIN_COPY, otherOutlet, outletLabel, type Outlet, type PublicReport, type ReportsPayload } from "#/data/laporan.ts"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"
import { loadProvinces } from "#/data/geo.ts"
import { LIST_PAGE_SIZE, mapAndProvinceRows } from "#/lib/laporan.ts"
import { seoLinks, seoMeta, seoScripts } from "#/seo.ts"

const provinces = new Set(loadProvinces().map((province) => province.code))

const loadWindow = (outlet: Outlet, commodityId: string | null) =>
  Effect.gen(function* () {
    const pages: PublicReport[][] = []
    let cursor: string | null = null
    let guard = 0
    while (guard < 20) {
      const page: ReportsPayload = yield* fetchReports({
        outlet,
        commodityId,
        cursor,
        windowOnly: true,
        limit: 100,
      })
      pages.push([...page.rows])
      cursor = page.nextCursor
      guard += 1
      if (cursor == null) break
    }
    return pages.flat()
  })

export const Route = createFileRoute("/laporan")({
  ssr: false,
  head: () => ({
    meta: seoMeta("laporan"),
    links: seoLinks("laporan"),
    scripts: seoScripts("laporan"),
  }),
  validateSearch: (search: Record<string, unknown>) => {
    const outlet: Outlet = search.outlet === "ritel" ? "ritel" : "pasar"
    const commodity = parseCommoditySearch(search).komoditas
    const provinsi = typeof search.provinsi === "string" && provinces.has(search.provinsi) ? search.provinsi : undefined
    return { outlet, komoditas: commodity, provinsi }
  },
  component: LaporanPage,
})

function LaporanPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const commodityId = search.komoditas ?? null
  const [mapRows, setMapRows] = useState<readonly PublicReport[]>([])
  const [provinceRows, setProvinceRows] = useState<readonly PublicReport[]>([])
  const [listRows, setListRows] = useState<readonly PublicReport[]>([])
  const [more, setMore] = useState<{ windowOnly: boolean; cursor: string | null } | null>(null)
  const [windowEmpty, setWindowEmpty] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const requestGen = useRef(0)

  useEffect(() => {
    const generation = requestGen.current
    void Effect.runPromise(
      Effect.gen(function* () {
        const [selected, other, listed] = yield* Effect.all(
          [
            loadWindow(search.outlet, commodityId),
            loadWindow(otherOutlet(search.outlet), commodityId),
            fetchReports({
              outlet: search.outlet,
              commodityId,
              cursor: null,
              windowOnly: true,
              limit: LIST_PAGE_SIZE,
            }),
          ],
          { concurrency: 3 },
        )
        return { split: mapAndProvinceRows(selected, other), listed }
      }).pipe(
        Effect.match({
          onFailure: () => {
            if (requestGen.current !== generation) return
            setMapRows([])
            setProvinceRows([])
            setListRows([])
            setWindowEmpty(false)
            setMore(null)
            setLoadError(true)
          },
          onSuccess: (loaded) => {
            if (requestGen.current !== generation) return
            setMapRows(loaded.split.mapRows)
            setProvinceRows(loaded.split.provinceRows)
            setListRows(loaded.listed.rows)
            setWindowEmpty(loaded.split.mapRows.length === 0)
            setLoadError(false)
            if (loaded.listed.nextCursor != null) {
              setMore({ windowOnly: true, cursor: loaded.listed.nextCursor })
            } else if (loaded.listed.resumeCursor != null || loaded.split.mapRows.length === 0) {
              setMore({ windowOnly: false, cursor: loaded.listed.resumeCursor })
            } else {
              setMore(null)
            }
          },
        }),
      ),
    )
    return () => {
      requestGen.current += 1
    }
  }, [search.outlet, commodityId])

  const loadOlder = () => {
    if (more == null) return
    const request = more
    const generation = requestGen.current
    void Effect.runPromise(
      fetchReports({
        outlet: search.outlet,
        commodityId,
        cursor: request.cursor,
        windowOnly: request.windowOnly,
        limit: LIST_PAGE_SIZE,
      }).pipe(
        Effect.match({
          onFailure: () => {
            if (requestGen.current !== generation) return
            setMore(null)
          },
          onSuccess: (page) => {
            if (requestGen.current !== generation) return
            if (page.rows.length === 0) {
              setMore(null)
              return
            }
            setListRows((current) => [
              ...current,
              ...page.rows.filter((row) => row.outlet === search.outlet && !current.some((item) => item.id === row.id)),
            ])
            if (page.nextCursor != null) {
              setMore({ windowOnly: request.windowOnly, cursor: page.nextCursor })
            } else if (request.windowOnly && page.resumeCursor != null) {
              setMore({ windowOnly: false, cursor: page.resumeCursor })
            } else {
              setMore(null)
            }
          },
        }),
      ),
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Laporan Warga</h2>
        <p className="text-sm text-slate">Harga yang dilaporkan warga. Bukan data PIHPS.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          active={search.outlet === "pasar"}
          onClick={() => void navigate({ search: (prev) => ({ ...prev, outlet: "pasar" }) })}
        >
          {outletLabel("pasar")}
        </Button>
        <Button
          type="button"
          active={search.outlet === "ritel"}
          onClick={() => void navigate({ search: (prev) => ({ ...prev, outlet: "ritel" }) })}
        >
          {outletLabel("ritel")}
        </Button>
      </div>
      <CommoditySelect
        commodities={COMMODITIES}
        value={commodityId ?? ""}
        allowEmpty
        onChange={(id) =>
          void navigate({
            search: (prev) => ({ ...prev, komoditas: id === "" ? undefined : id }),
          })
        }
      />
      <LaporanMap
        rows={mapRows}
        outlet={search.outlet}
        commodityId={commodityId}
        onProvince={(code) => void navigate({ search: (prev) => ({ ...prev, provinsi: code }) })}
      />
      {loadError ? (
        <p className="text-sm text-slate">Daftar laporan tidak bisa dimuat.</p>
      ) : windowEmpty ? (
        <p className="text-sm text-slate">
          {EMPTY_WINDOW_COPY} {NO_PIN_COPY}
        </p>
      ) : (
        <p className="text-sm text-slate">{NO_PIN_COPY}</p>
      )}
      <LaporanProvince
        rows={provinceRows}
        commodityId={commodityId}
        provinceCode={search.provinsi ?? null}
        onProvince={(code) => void navigate({ search: (prev) => ({ ...prev, provinsi: code === "" ? undefined : code }) })}
      />
      <LaporanList rows={listRows} windowEmpty={windowEmpty} canLoadOlder={more != null} onLoadOlder={loadOlder} />
    </main>
  )
}
