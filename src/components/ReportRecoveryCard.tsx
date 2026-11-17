import type { ReactNode } from "react"
import { Button, Card, StatusMessage } from "@monitor-pangan/ui"

const RECOVERY_TITLE = "Laporan ini mungkin sudah tersimpan."
const RECOVERY_DETAIL =
  "Isian asli di bawah sudah dikirim dan mungkin tersimpan. Mengubah isian tidak memperbarui laporan itu. Kirim ulang isian asli, atau mulai laporan baru dengan isian Anda."
const RETRY_COPY = "Kirim ulang laporan"
const NEW_REPORT_COPY = "Mulai laporan baru"
const NEW_REPORT_HINT =
  "Memulai laporan baru memakai nomor baru. Laporan sebelumnya mungkin sudah tersimpan, jadi ini dapat membuat laporan ganda."

type ReportRecoveryCardProps = {
  commodityName: string
  /** Already formatted, e.g. "Rp 16.000/kg". */
  priceLabel: string
  placeName: string
  hasPhoto: boolean
  pending: boolean
  error: string | null
  onRetry: () => void
  onNewReport: () => void
  /** The fresh Turnstile widget, kept mounted by the form. */
  children?: ReactNode
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-slate">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  )
}

/**
 * Recovery after an uncertain submit: the original attempt may already be stored, so a retry resends
 * exactly these values. Editing requires an explicit new report. Presentational; the form owns state.
 */
export function ReportRecoveryCard({
  commodityName,
  priceLabel,
  placeName,
  hasPhoto,
  pending,
  error,
  onRetry,
  onNewReport,
  children,
}: ReportRecoveryCardProps) {
  return (
    <Card padding="lg" className="flex flex-col gap-3">
      <p className="font-bold">{RECOVERY_TITLE}</p>
      <p className="text-sm text-slate">{RECOVERY_DETAIL}</p>
      <dl className="flex flex-col gap-1 rounded-lg border border-hairline bg-canvas p-3 text-sm">
        <SummaryRow label="Komoditas" value={commodityName} />
        <SummaryRow label="Harga" value={priceLabel} />
        <SummaryRow label="Tempat" value={placeName} />
        <SummaryRow label="Foto" value={hasPhoto ? "Ada" : "Tidak ada"} />
      </dl>
      {children}
      {error != null ? <StatusMessage tone="error" title={error} bare /> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="primary" onClick={onRetry} disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Mengirim ulang…" : RETRY_COPY}
        </Button>
        <Button variant="rect" onClick={onNewReport} disabled={pending}>
          {NEW_REPORT_COPY}
        </Button>
      </div>
      <p className="text-xs text-slate">{NEW_REPORT_HINT}</p>
    </Card>
  )
}