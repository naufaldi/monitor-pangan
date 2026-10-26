import { Button, StatusMessage } from "@monitor-pangan/ui"
import { usePriceFreshness, type FreshnessState } from "#/data/vintage.tsx"
import { formatDateLong } from "#/lib/format.ts"
import { formatHealthTime } from "#/data/health-copy.ts"

export function healthStatusCopy(state: FreshnessState): string {
  if (state.status === "idle" || state.status === "loading") return "Memeriksa pembaruan PIHPS…"
  if (state.healthFailed) return "Status pembaruan PIHPS belum dapat diperiksa."
  switch (state.health?.status) {
    case "ok": return "Pemeriksaan PIHPS selesai."
    case "waiting": return "Menunggu publikasi PIHPS."
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
    <StatusMessage
      tone={loading ? "loading" : needsRetry ? "error" : "empty"}
      title={healthStatusCopy(freshness)}
      action={!loading || needsRetry ? <Button onClick={retry} disabled={loading}>{needsRetry ? "Coba lagi" : "Periksa lagi"}</Button> : undefined}
    >
      {freshness.refreshFailed ? <p>Harga yang sudah tersedia tetap ditampilkan. Pembaruan harga gagal; data belum dapat dipastikan mutakhir.</p> : null}
      {health != null ? <>
        <p>Observasi harga terakhir dalam layanan: {health.latestPricedDate == null ? "belum tersedia" : formatDateLong(health.latestPricedDate)}.</p>
        <p>Pemeriksaan status layanan: {formatHealthTime(health.checkedAt)}. Proses berhasil terakhir: {formatHealthTime(health.lastSuccessfulRunAt)}.</p>
        {freshness.healthFailed ? <p>Waktu di atas berasal dari pemeriksaan sebelumnya.</p> : null}
      </> : null}
    </StatusMessage>
  )
}

/** Always pass the actual selected snapshot, never global health evidence. */
export function SnapshotCoverage({ pricedCount, total, date, compact = false }: { pricedCount: number; total: number; date: string; compact?: boolean }) {
  if (compact) return <p className="text-xs text-slate">{pricedCount} dari {total} provinsi<span className="sr-only"> memiliki harga pada {formatDateLong(date)}. Provinsi tanpa observasi tetap kosong, bukan nol.</span></p>
  return <p role="status" className="text-sm text-slate">Cakupan {formatDateLong(date)}: {pricedCount} dari {total} provinsi memiliki harga untuk komoditas ini. Provinsi tanpa observasi tetap kosong, bukan nol.</p>
}
