import { Button, Card, cn, focusRing } from "@monitor-pangan/ui"
import { usePriceFreshness, type FreshnessState } from "#/data/vintage.tsx"
import { formatDateLong } from "#/lib/format.ts"
import { formatHealthTime } from "#/data/health-copy.ts"

export function healthStatusCopy(state: FreshnessState): string {
  if (state.status === "idle" || state.status === "loading") return "Memeriksa pembaruan PIHPS…"
  if (state.healthFailed) return "Status pembaruan PIHPS belum dapat diperiksa."
  switch (state.health?.status) {
    case "ok": return "Pemeriksaan PIHPS selesai."
    case "waiting": return "Pembaruan PIHPS hari ini belum terkonfirmasi."
    case "degraded": return "Pembaruan PIHPS tertunda atau belum lengkap."
    case "unavailable": return "Status pembaruan PIHPS tidak tersedia."
    default: return "Status pembaruan PIHPS belum tersedia."
  }
}

/** Pipeline-wide health. It does not describe the selected commodity's coverage. */
export function PriceFreshness() {
  const { freshness, retry } = usePriceFreshness()
  const health = freshness.health
  const loading = freshness.status === "loading" || freshness.status === "idle"
  const needsRetry = freshness.refreshFailed || freshness.healthFailed || health?.status === "degraded" || health?.status === "unavailable"
  return (
    <Card className="px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <div role={needsRetry && !loading ? "alert" : "status"} className="py-1">
          <p className={cn("font-semibold", needsRetry && !loading && "text-ember")}>{healthStatusCopy(freshness)}</p>
          {freshness.refreshFailed ? <p>Harga yang sudah tersedia tetap ditampilkan. Pembaruan harga gagal; data belum dapat dipastikan mutakhir.</p> : null}
          {health != null ? <p className="text-slate">Observasi terakhir{freshness.healthFailed ? " (pemeriksaan sebelumnya)" : ""}: {health.latestPricedDate == null ? "belum tersedia" : formatDateLong(health.latestPricedDate)}.</p> : null}
        </div>
        {!loading || needsRetry ? <Button onClick={retry} disabled={loading}>{needsRetry ? "Coba lagi" : "Periksa lagi"}</Button> : null}
      </div>
      <details className="text-slate">
        <summary className={cn("w-fit cursor-pointer py-3 font-medium", focusRing)}>Jadwal dan riwayat pemeriksaan</summary>
        <div className="space-y-1 pb-2">
          <p>Pemeriksaan otomatis dijadwalkan Senin–Jumat pukul 14.15 dan 17.15 WIB. Tidak ada pemeriksaan terjadwal pada akhir pekan.</p>
          <p>Tombol periksa memuat ulang harga dan status layanan; tidak menjalankan pengambilan harga dari PIHPS.</p>
          {health != null ? <p>Pemeriksaan status layanan: {formatHealthTime(health.checkedAt)}. Proses berhasil terakhir: {formatHealthTime(health.lastSuccessfulRunAt)}.</p> : null}
        </div>
      </details>
    </Card>
  )
}

/** Always pass the actual selected snapshot, never global health evidence. */
export function SnapshotCoverage({ pricedCount, total, date, compact = false }: { pricedCount: number; total: number; date: string; compact?: boolean }) {
  if (compact) return <p className="text-xs text-slate">{pricedCount} dari {total} provinsi<span className="sr-only"> memiliki harga pada {formatDateLong(date)}. Provinsi tanpa observasi tetap kosong, bukan nol.</span></p>
  return <p role="status" className="text-sm text-slate">Cakupan {formatDateLong(date)}: {pricedCount} dari {total} provinsi memiliki harga untuk komoditas ini. Provinsi tanpa observasi tetap kosong, bukan nol.</p>
}
