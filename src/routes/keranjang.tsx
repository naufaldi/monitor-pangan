import { useCallback, useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { Button, FieldInput, FieldSelect, PageHeader, PageShell, StatusMessage, StickyToolbar, tableClass, tdClass, thClass } from "@monitor-pangan/ui"
import { BasketSummary } from "#/components/BasketSummary.tsx"
import { basketToSave, browserBasketStorage, clearBasket, loadBasket, restoredQuantities, saveBasket } from "#/data/basket-storage.ts"
import { usePriceRequest } from "#/data/price-request.ts"
import { dataBadge, latestLiveDate, liveSurveyDates, provider } from "#/data/provider.ts"
import { usePageSourceNote, useVintage } from "#/data/vintage.tsx"
import { calculateBasket } from "#/lib/basket.ts"
import { DEFAULT_PROVINCE, parseProvinceSearch } from "#/lib/commodity-search.ts"
import { formatDateLong, formatPrice, formatRupiah } from "#/lib/format.ts"
import { cachedOverview, loadProvinceOverview, overviewReader } from "#/lib/province-overview.ts"
import { seoLinks, seoMeta, seoScripts } from "#/seo.ts"

export const Route = createFileRoute("/keranjang")({
  ssr: false,
  head: () => ({ meta: seoMeta("keranjang"), links: seoLinks("keranjang"), scripts: seoScripts("keranjang") }),
  validateSearch: (search: Record<string, unknown>): { provinsi?: string } => {
    const { provinsi } = parseProvinceSearch(search)
    return provinsi == null ? {} : { provinsi }
  },
  component: BasketPage,
})

function BasketPage() {
  const rev = useVintage()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const dates = useMemo(() => liveSurveyDates(), [rev])
  const provinces = useMemo(() => provider.provinces(), [])
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [pinnedDate, setDate] = useState<string | null>(null)
  const [pinnedComparison, setComparison] = useState<string | null | undefined>(undefined)
  const [savedProvince, setSavedProvince] = useState<string | undefined>(undefined)
  const [restoring, setRestoring] = useState(true)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const province = search.provinsi ?? savedProvince ?? DEFAULT_PROVINCE
  const date = pinnedDate ?? latestLiveDate()
  const comparisonDate = pinnedComparison === undefined ? dates[dates.indexOf(date) - 1] ?? null : pinnedComparison
  const currentAvailable = dates.includes(date) && dataBadge(date) !== "Data contoh"
  const comparisonAvailable = comparisonDate != null && comparisonDate < date && dates.includes(comparisonDate) && dataBadge(comparisonDate) !== "Data contoh"
  const readComparison = comparisonAvailable ? comparisonDate : null
  const sourceNote = usePageSourceNote(date)

  // Storage is external state. Totals remain derived from the current inputs and prices.
  useEffect(() => {
    let live = true
    void Effect.runPromise(loadBasket(browserBasketStorage).pipe(Effect.match({
      onFailure: (error) => {
        if (!live) return
        setNotice({ error: true, text: error.kind === "invalid" ? "Keranjang tersimpan tidak valid. Isian baru tetap dapat digunakan; simpan untuk menggantinya." : "Penyimpanan perangkat tidak tersedia. Estimasi tetap dapat digunakan tanpa menyimpan." })
        setRestoring(false)
      },
      onSuccess: (basket) => {
        if (!live) return
        if (basket != null) {
          setQuantities(restoredQuantities(basket))
          setDate(basket.date)
          setComparison(basket.comparisonDate)
          setSavedProvince(basket.province)
          setNotice({ error: false, text: "Keranjang perangkat dimuat. Harga dan total dihitung ulang untuk provinsi yang dipilih." })
        }
        setRestoring(false)
      },
    })))
    return () => { live = false }
  }, [])

  const initial = useMemo(() => cachedOverview(date, readComparison, overviewReader), [date, readComparison, rev])
  const cached = !currentAvailable || restoring || initial.entries.every((entry) => entry.current.status === "ready" && (entry.previous == null || entry.previous.status === "ready")) ? initial : null
  // A freshness notification can update cached prices without restarting the same date reads.
  const load = useCallback(() => loadProvinceOverview(date, readComparison, overviewReader), [date, readComparison])
  const { request, retry } = usePriceRequest(`basket:${date}:${readComparison ?? ""}`, cached, load)
  const overview = request.status === "ready" ? { ...initial, entries: initial.entries.map((entry, index) => ({
    ...entry,
    current: entry.current.status === "ready" ? entry.current : request.data.entries[index]!.current,
    previous: entry.previous?.status === "ready" ? entry.previous : request.data.entries[index]!.previous,
  })) } : initial
  const estimate = calculateBasket(overview, province, quantities, currentAvailable && !restoring, comparisonAvailable && !restoring)
  const failed = overview.entries.some((entry) => entry.current.status === "error" || entry.previous?.status === "error")
  const toSave = currentAvailable && (comparisonDate == null || comparisonAvailable) ? basketToSave(province, date, comparisonDate, quantities) : null
  const provinceName = provinces.find((item) => item.code === province)?.name ?? province
  const dateOptions = useMemo(() => [...dates].reverse().map((day) => <option key={day} value={day}>{formatDateLong(day)}</option>), [dates])
  const comparisonOptions = useMemo(() => [...dates].reverse().filter((day) => day < date).map((day) => <option key={day} value={day}>{formatDateLong(day)}</option>), [dates, date])

  const save = () => {
    if (toSave == null) return
    void Effect.runPromise(saveBasket(browserBasketStorage, toSave).pipe(Effect.match({
      onFailure: () => setNotice({ error: true, text: "Keranjang belum tersimpan. Penyimpanan perangkat tidak tersedia; isian Anda tetap ada." }),
      onSuccess: () => setNotice({ error: false, text: "Keranjang tersimpan di perangkat ini. Jumlah tidak dibagikan melalui tautan." }),
    })))
  }
  const clear = () => {
    void Effect.runPromise(clearBasket(browserBasketStorage).pipe(Effect.match({
      onFailure: () => setNotice({ error: true, text: "Keranjang tersimpan belum dapat dihapus. Periksa izin penyimpanan perangkat." }),
      onSuccess: () => {
        setQuantities({})
        setDate(null)
        setComparison(undefined)
        setSavedProvince(province)
        setNotice({ error: false, text: "Keranjang tersimpan dihapus dan jumlah dikosongkan." })
      },
    })))
  }

  return <PageShell>
    <PageHeader title="Estimasi keranjang pangan" description="Masukkan jumlah belanja Anda. Estimasi memakai rata-rata survei provinsi PIHPS, bukan harga toko atau indeks biaya hidup." />
    <StickyToolbar>
      <FieldSelect label="Provinsi" value={province} disabled={restoring} wrapperClassName="min-w-48 flex-1" onChange={(event) => { void navigate({ search: { provinsi: event.target.value } }) }}>
        {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
      </FieldSelect>
      <FieldSelect label="Tanggal estimasi" value={date} disabled={restoring || dates.length === 0} onChange={(event) => { setDate(event.target.value); setComparison(undefined) }}>
        {!dates.includes(date) ? <option value={date}>{date || "Belum ada tanggal"} · tidak tersedia</option> : null}
        {dateOptions}
      </FieldSelect>
      <FieldSelect label="Tanggal pembanding" value={comparisonDate ?? ""} disabled={restoring || !currentAvailable} onChange={(event) => setComparison(event.target.value || null)}>
        <option value="">Tanpa pembanding</option>
        {comparisonDate != null && !comparisonAvailable ? <option value={comparisonDate}>{comparisonDate} · tidak tersedia</option> : null}
        {comparisonOptions}
      </FieldSelect>
    </StickyToolbar>

    {notice ? <StatusMessage tone={notice.error ? "error" : "empty"} title={notice.text} /> : null}
    {!restoring && (!currentAvailable || (comparisonDate != null && !comparisonAvailable)) ? <StatusMessage tone="error" title="Tanggal survei tidak tersedia">Pilih tanggal dengan data PIHPS. Tanggal tersimpan tidak diganti otomatis dan data contoh tidak dipakai untuk estimasi.</StatusMessage> : null}
    {restoring || request.status === "loading" ? <StatusMessage tone="loading" title={restoring ? "Memuat keranjang perangkat…" : "Memuat harga keranjang…"}>Jumlah dan provinsi tidak mengubah tanggal survei harga.</StatusMessage> : null}
    {failed || request.status === "error" ? <StatusMessage tone="error" title="Sebagian harga gagal dimuat" action={<Button onClick={retry} disabled={request.status === "loading"}>Coba lagi</Button>}>Harga lain tetap tampil. Total menunggu seluruh harga komoditas yang dipilih.</StatusMessage> : null}

    <BasketSummary estimate={estimate} date={date} comparisonDate={comparisonDate} />
    <p id="basket-quantity-help" className="text-sm text-slate">Jumlah 0–1.000 kg atau liter, maksimal dua angka desimal. Contoh: 0,25. Kosong atau nol berarti tidak dipilih.</p>
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <caption className="pb-2 text-left text-sm text-slate">Keranjang {provinceName}. Harga dan biaya setiap kolom memakai tanggal yang sama.</caption>
        <thead><tr>
          <th className={thClass("start")}>Komoditas dan jumlah</th>
          <th className={thClass("end")}>Harga · {date ? formatDateLong(date) : "belum tersedia"}</th>
          <th className={thClass("end")}>Estimasi biaya</th>
          <th className={thClass("end")}>Biaya pembanding{comparisonDate ? ` · ${formatDateLong(comparisonDate)}` : ""}</th>
        </tr></thead>
        <tbody>{estimate.lines.map((line) => <tr key={line.commodity.id} className="border-t border-hairline">
          <td className={tdClass("start", "min-w-52")}><FieldInput id={`quantity-${line.commodity.id}`} label={`Jumlah ${line.commodity.name} (${line.commodity.unit})`}
            inputMode="decimal" autoComplete="off" maxLength={16} value={quantities[line.commodity.id] ?? ""} disabled={restoring} aria-describedby="basket-quantity-help"
            error={line.quantity.valid ? undefined : "Gunakan 0–1.000, maksimal dua desimal."}
            onChange={(event) => { const value = event.target.value; setQuantities((previous) => ({ ...previous, [line.commodity.id]: value })) }} />
          </td>
          <td className={tdClass("end")}>{line.price == null ? line.current.status === "loading" && request.status === "loading" ? "Memuat…" : line.current.status === "error" ? "Gagal dimuat" : "Tidak ada harga" : formatPrice(line.price, line.commodity.unit)}</td>
          <td className={tdClass("end")}>{line.quantity.valid && line.quantity.hundredths === 0 ? "Tidak dipilih" : line.cost == null ? "Belum tersedia" : formatRupiah(line.cost)}</td>
          <td className={tdClass("end")}>{comparisonDate == null ? "Tanpa pembanding" : line.quantity.valid && line.quantity.hundredths === 0 ? "Tidak dipilih" : line.previousCost == null ? "Belum tersedia" : formatRupiah(line.previousCost)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" onClick={save} disabled={restoring || toSave == null}>Simpan di perangkat</Button>
      <Button onClick={clear} disabled={restoring}>Kosongkan keranjang</Button>
    </div>
    <footer className="flex flex-col gap-2 pb-6 text-xs text-slate">
      <p>{sourceNote} Harga toko dapat berbeda. Estimasi tidak menyatakan kebutuhan gizi atau periode belanja tertentu.</p>
      <p>Biaya tiap komoditas dibulatkan ke rupiah terdekat, lalu dijumlahkan. Kg dan liter tetap terpisah. Penyimpanan hanya berlaku di peramban dan perangkat ini.</p>
    </footer>
  </PageShell>
}
