import { useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { Button, PageHeader, PageShell, SegmentedControl, StatusMessage } from "@monitor-pangan/ui"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { LaporanList } from "#/components/LaporanList.tsx"
import { LaporanMap } from "#/components/LaporanMap.tsx"
import { LaporanProvince } from "#/components/LaporanProvince.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { fetchReports } from "#/data/laporan-client.ts"
import { EMPTY_WINDOW_COPY, NO_PIN_COPY, otherOutlet, outletLabel, type Outlet, type PublicReport, type ReportsPayload } from "#/data/laporan.ts"
import { parseLaporanSearch } from "#/lib/laporan-search.ts"
import { loadProvinces } from "#/data/geo.ts"
import { LIST_PAGE_SIZE, mapAndProvinceRows } from "#/lib/laporan.ts"
import { seoLinks, seoMeta, seoScripts } from "#/seo.ts"

const provinces = new Set(loadProvinces().map((province) => province.code))

type RequestStatus = "loading" | "ready" | "error"

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
  validateSearch: (search: Record<string, unknown>) => parseLaporanSearch(search, provinces),
  component: LaporanPage,
})

function LaporanPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const outlet: Outlet = search.outlet === "ritel" ? "ritel" : "pasar"
  const commodityId = search.komoditas ?? null
  const [mapRows, setMapRows] = useState<readonly PublicReport[]>([])
  const [provinceRows, setProvinceRows] = useState<readonly PublicReport[]>([])
  const [listRows, setListRows] = useState<readonly PublicReport[]>([])
  const [more, setMore] = useState<{ windowOnly: boolean; cursor: string | null } | null>(null)
  const [windowEmpty, setWindowEmpty] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${outlet}:${commodityId ?? ""}:${attempt}`
  const [request, setRequest] = useState<{ key: string; status: RequestStatus }>({ key: requestKey, status: "loading" })
  const status = request.key === requestKey ? request.status : "loading"
  const [olderStatus, setOlderStatus] = useState<RequestStatus>("ready")
  const loadingOlder = useRef(false)
  const requestGen = useRef(0)

  useEffect(() => {
    const generation = requestGen.current
    setRequest({ key: requestKey, status: "loading" })
    setOlderStatus("ready")
    loadingOlder.current = false
    void Effect.runPromise(
      Effect.gen(function* () {
        const [selected, other, listed] = yield* Effect.all(
          [
            loadWindow(outlet, commodityId),
            loadWindow(otherOutlet(outlet), commodityId),
            fetchReports({
              outlet,
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
            setRequest({ key: requestKey, status: "error" })
          },
          onSuccess: (loaded) => {
            if (requestGen.current !== generation) return
            setMapRows(loaded.split.mapRows)
            setProvinceRows(loaded.split.provinceRows)
            setListRows(loaded.listed.rows)
            setWindowEmpty(loaded.split.mapRows.length === 0)
            setRequest({ key: requestKey, status: "ready" })
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
  }, [outlet, commodityId, requestKey])

  const loadOlder = () => {
    if (more == null || status !== "ready" || loadingOlder.current) return
    loadingOlder.current = true
    setOlderStatus("loading")
    const request = more
    const generation = requestGen.current
    void Effect.runPromise(
      fetchReports({
        outlet,
        commodityId,
        cursor: request.cursor,
        windowOnly: request.windowOnly,
        limit: LIST_PAGE_SIZE,
      }).pipe(
        Effect.match({
          onFailure: () => {
            if (requestGen.current !== generation) return
            loadingOlder.current = false
            setOlderStatus("error")
          },
          onSuccess: (page) => {
            if (requestGen.current !== generation) return
            loadingOlder.current = false
            setOlderStatus("ready")
            if (page.rows.length === 0) {
              setMore(null)
              return
            }
            setListRows((current) => [
              ...current,
              ...page.rows.filter((row) => row.outlet === outlet && !current.some((item) => item.id === row.id)),
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
    <PageShell>
      <PageHeader title="Laporan Warga" description="Harga yang dilaporkan warga. Bukan data PIHPS." />
      <SegmentedControl
        label="Jenis tempat"
        options={[
          { value: "pasar", label: outletLabel("pasar") },
          { value: "ritel", label: outletLabel("ritel") },
        ] as const}
        value={outlet}
        onChange={(next) =>
          void navigate({ search: (prev) => ({ ...prev, outlet: next === "ritel" ? "ritel" : undefined }) })
        }
      />
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
      {status === "loading" ? (
        <StatusMessage tone="loading" title="Memuat laporan…" />
      ) : status === "error" ? (
        <StatusMessage
          tone="error"
          title="Daftar laporan tidak bisa dimuat."
          action={<Button onClick={() => setAttempt((current) => current + 1)}>Coba lagi</Button>}
        >
          Periksa koneksi lalu coba lagi.
        </StatusMessage>
      ) : (
        <>
          <LaporanMap
            rows={mapRows}
            outlet={outlet}
            commodityId={commodityId}
            onProvince={(code) => void navigate({ search: (prev) => ({ ...prev, provinsi: code }) })}
          />
          {windowEmpty ? (
            <StatusMessage tone="empty" title={EMPTY_WINDOW_COPY}>{NO_PIN_COPY}</StatusMessage>
          ) : (
            <p className="text-sm text-slate">{NO_PIN_COPY}</p>
          )}
          <LaporanProvince
            rows={provinceRows}
            commodityId={commodityId}
            provinceCode={search.provinsi ?? null}
            onProvince={(code) => void navigate({ search: (prev) => ({ ...prev, provinsi: code === "" ? undefined : code }) })}
          />
          <LaporanList rows={listRows} windowEmpty={windowEmpty} canLoadOlder={more != null && olderStatus === "ready"} onLoadOlder={loadOlder} />
          {olderStatus === "loading" ? <StatusMessage tone="loading" title="Memuat laporan lebih lama…" /> : null}
          {olderStatus === "error" ? (
            <StatusMessage tone="error" title="Laporan lebih lama tidak bisa dimuat." action={<Button onClick={loadOlder}>Coba lagi</Button>} />
          ) : null}
        </>
      )}
    </PageShell>
  )
}
