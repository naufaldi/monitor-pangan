import { useCallback, useMemo, useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Button, Card, Delta, FieldSelect, PageHeader, PageShell, Stat, StatList, StatusMessage, StickyToolbar, buttonClass, tableClass, tdClass, thClass } from "@monitor-pangan/ui"
import { DatePicker } from "#/components/DatePicker.tsx"
import { SnapshotCoverage } from "#/components/PriceFreshness.tsx"
import { usePriceRequest } from "#/data/price-request.ts"
import { latestLiveDate, liveSurveyDates, provider } from "#/data/provider.ts"
import { usePageSourceNote, useVintage } from "#/data/vintage.tsx"
import { parseOverviewSearch } from "#/lib/commodity-search.ts"
import { formatDateLong, formatDateShort, formatPct, formatPrice, trendDirection } from "#/lib/format.ts"
import { cachedOverview, loadProvinceOverview, overviewReader, provinceOverviewRows } from "#/lib/province-overview.ts"
import { seoLinks, seoMeta, seoScripts } from "#/seo.ts"

export const Route = createFileRoute("/provinsi")({
  ssr: false,
  head: () => ({ meta: seoMeta("provinsi"), links: seoLinks("provinsi"), scripts: seoScripts("provinsi") }),
  validateSearch: (search: Record<string, unknown>) => parseOverviewSearch(search),
  component: ProvincePage,
})

function ProvincePage() {
  const rev = useVintage()
  const search = parseOverviewSearch(Route.useSearch())
  const navigate = Route.useNavigate()
  const dates = useMemo(() => liveSurveyDates(), [rev])
  const provinces = useMemo(() => provider.provinces(), [])
  // Survey-date selection is local to this overview. Home alone owns tanggal in URLs.
  const [pinnedDate, setPinnedDate] = useState<string | null>(null)
  const date = pinnedDate != null && dates.includes(pinnedDate) ? pinnedDate : latestLiveDate()
  const previousDate = dates[dates.indexOf(date) - 1] ?? null
  const sourceNote = usePageSourceNote(date)
  const initial = useMemo(() => cachedOverview(date, previousDate, overviewReader), [date, previousDate, rev])
  const cached = initial.entries.every((entry) => entry.current.status === "ready" && (entry.previous == null || entry.previous.status === "ready")) ? initial : null
  const load = useCallback(() => loadProvinceOverview(date, previousDate, overviewReader), [date, previousDate, rev])
  const { request, retry } = usePriceRequest(`overview:${date}:${previousDate ?? ""}:${rev}`, cached, load)
  const overview = request.status === "ready" ? request.data : initial
  const rows = provinceOverviewRows(overview, search.provinsi)
  const province = provinces.find((item) => item.code === search.provinsi)
  const pricedCount = rows.filter((row) => row.price != null).length
  const failedCount = rows.filter((row) => row.current.status === "error" || row.previous?.status === "error").length
  const loading = request.status === "loading"

  return <PageShell>
    <PageHeader title={`Harga pangan ${province?.name ?? search.provinsi}`}
      description="Rata-rata survei provinsi dari PIHPS. Harga tiap toko dapat berbeda." />
    <StickyToolbar>
      <FieldSelect label="Provinsi" value={search.provinsi} wrapperClassName="min-w-48 flex-1"
        onChange={(event) => { void navigate({ search: (previous) => ({ ...previous, provinsi: event.target.value }) }) }}>
        {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
      </FieldSelect>
      <DatePicker dates={dates} value={date} onChange={setPinnedDate} />
    </StickyToolbar>

    <Card>
      <StatList columns={3}>
        <Stat label="Tanggal survei seluruh komoditas" value={formatDateLong(date)} hint="Satu tanggal yang sama; harga kosong tetap kosong." />
        <Stat label="Cakupan provinsi ini" value={`${pricedCount} dari ${rows.length} komoditas`} hint={loading ? "Sebagian harga masih dimuat." : "Harga yang tersedia pada tanggal dipilih."} />
        <Stat label="Pembanding perubahan" value={previousDate == null ? "Belum tersedia" : `${formatDateShort(previousDate)} → ${formatDateShort(date)}`} hint="Hanya dihitung jika kedua tanggal memiliki harga provinsi." />
      </StatList>
    </Card>

    {loading ? <StatusMessage tone="loading" title="Memuat harga yang belum tersedia…">Harga yang sudah dimuat tetap ditampilkan. Seluruh baris memakai {formatDateLong(date)}.</StatusMessage> : null}
    {request.status === "error" || failedCount > 0 ? <StatusMessage tone="error" title="Sebagian harga gagal dimuat" action={<Button onClick={retry}>Coba lagi</Button>}>
      {failedCount > 0 ? `${failedCount} komoditas memiliki permintaan yang gagal.` : "Permintaan harga gagal."} Harga lain tetap dapat dibaca. Coba lagi untuk memuat sel yang belum tersedia.
    </StatusMessage> : null}
    {!loading && pricedCount === 0 && failedCount === 0 ? <StatusMessage tone="empty" title="Tidak ada harga provinsi untuk tanggal ini">Provinsi ini tidak disurvei PIHPS, atau sumbernya kosong. Harga nasional tidak menggantikan harga provinsi.</StatusMessage> : null}

    <div className="overflow-x-auto">
      <table className={tableClass}>
        <caption className="pb-2 text-left text-sm text-slate">Sepuluh komoditas · {province?.name ?? search.provinsi} · {formatDateLong(date)}. Perbandingan nasional memakai tanggal yang sama.</caption>
        <thead><tr>
          <th className={thClass("start")}>Komoditas</th>
          <th className={thClass("end")}>Harga provinsi</th>
          <th className={thClass("end")}>Dibanding nasional</th>
          <th className={thClass("end")}>Perubahan {previousDate == null ? "belum tersedia" : `${formatDateShort(previousDate)} → ${formatDateShort(date)}`}</th>
          <th className={thClass("start")}>Jelajahi</th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.commodity.id} className="border-t border-hairline">
          <td className={tdClass("start")}>
            <p>{row.commodity.name}</p>
            {row.current.status === "ready" ? <SnapshotCoverage pricedCount={row.current.snapshot.pricedCount} total={row.current.snapshot.rows.length} date={row.current.snapshot.date} /> : null}
          </td>
          <td className={tdClass("end")}>
            {row.price != null ? formatPrice(row.price, row.commodity.unit) : <span>{row.current.status === "loading" ? "Memuat…" : row.current.status === "error" ? "Gagal dimuat" : "Tidak ada data"} · Rp/{row.commodity.unit}</span>}
          </td>
          <td className={tdClass("end")}>
            {row.nationalPct == null ? "Tidak dapat dibandingkan" : <Delta direction={trendDirection(row.nationalPct)}>{formatPct(row.nationalPct)}</Delta>}
            {row.national != null ? <p className="text-xs text-slate">Nasional {formatPrice(row.national, row.commodity.unit)}</p> : null}
          </td>
          <td className={tdClass("end")}>
            {row.changePct == null ? <span>{row.previous?.status === "loading" ? "Memuat pembanding…" : row.previous?.status === "error" ? "Pembanding gagal dimuat" : "Observasi belum cukup"}</span> : <>
              <Delta direction={trendDirection(row.changePct)}>{formatPct(row.changePct)}</Delta>
              <p className="text-xs text-slate">Dari {formatPrice(row.previousPrice!, row.commodity.unit)}</p>
            </>}
          </td>
          <td className={tdClass("start")}><div className="flex flex-wrap gap-2">
            <Link to="/" search={{ komoditas: row.commodity.id, provinsi: search.provinsi, tanggal: date }} className={buttonClass("rect")}>Peta</Link>
            <Link to="/tren" search={{ komoditas: row.commodity.id, provinsi: search.provinsi }} className={buttonClass("rect")}>Grafik</Link>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
    <footer className="pb-6 text-xs text-slate">{sourceNote} Perubahan membandingkan dua tanggal survei yang disebutkan, bukan perubahan harga toko.</footer>
  </PageShell>
}
