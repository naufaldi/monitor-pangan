import { Card, Delta, Stat, StatList, StatusMessage } from "@monitor-pangan/ui"
import type { BasketEstimate, BasketTotal } from "#/lib/basket.ts"
import { formatDateLong, formatPct, formatRupiah, trendDirection } from "#/lib/format.ts"

function totalCopy(total: BasketTotal) {
  switch (total.status) {
    case "complete": return formatRupiah(total.total)
    case "empty": return "Isi jumlah terlebih dahulu"
    case "invalid": return "Perbaiki jumlah"
    case "incomplete": return "Belum lengkap"
  }
}

export function BasketSummary({ estimate, date, comparisonDate }: { estimate: BasketEstimate; date: string; comparisonDate: string | null }) {
  return <section aria-label="Ringkasan estimasi" aria-live="polite" className="flex flex-col gap-3">
    <Card padding="md"><StatList columns={3}>
      <Stat label="Estimasi keranjang" value={totalCopy(estimate.current)} hint={`${estimate.selectedCount} komoditas dipilih · ${date ? formatDateLong(date) : "Tanggal belum tersedia"}`} />
      <Stat label="Estimasi pembanding" value={comparisonDate == null ? "Tidak tersedia" : totalCopy(estimate.previous)} hint={comparisonDate == null ? "Belum ada tanggal pembanding." : formatDateLong(comparisonDate)} />
      <Stat label="Perubahan biaya" value={estimate.changeRp == null || estimate.changePct == null ? "Belum dapat dibandingkan" : <Delta direction={trendDirection(estimate.changePct)}>{formatRupiah(estimate.changeRp, true)} ({formatPct(estimate.changePct)})</Delta>} hint="Provinsi dan jumlah yang sama pada kedua tanggal." />
    </StatList></Card>
    {estimate.current.status === "incomplete" || (comparisonDate != null && estimate.previous.status === "incomplete") ? <StatusMessage tone="empty" title="Sebagian harga keranjang belum tersedia">
      Total untuk tanggal yang belum lengkap tidak ditampilkan. Harga kosong tidak dianggap nol dan tidak diganti harga nasional.
    </StatusMessage> : null}
    {estimate.current.status === "invalid" ? <StatusMessage tone="error" title="Perbaiki jumlah yang ditandai">Total dan penyimpanan menunggu seluruh jumlah valid.</StatusMessage> : null}
  </section>
}
