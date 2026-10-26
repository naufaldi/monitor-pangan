import { Button, StatusMessage } from "@monitor-pangan/ui"
import { DITINJAU_COPY, type ReportStatus } from "#/data/laporan.ts"
import { receiptStatusLabel } from "#/data/receipt.ts"

export type ReceiptRequestState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly reportStatus: ReportStatus }
  | { readonly status: "denied" }
  | { readonly status: "unavailable" }

export function ReceiptStatus({ state, retry }: { state: ReceiptRequestState; retry: () => void }) {
  if (state.status === "loading") return <StatusMessage tone="loading" title="Memuat status laporan…" />
  if (state.status === "denied") return <StatusMessage tone="error" title="Tautan status tidak valid atau tidak tersedia.">
    Gunakan tautan privat lengkap yang diterima setelah mengirim laporan. Nomor laporan saja tidak membuka status.
  </StatusMessage>
  if (state.status === "unavailable") return <StatusMessage tone="error" title="Status laporan belum dapat dimuat." action={<Button onClick={retry}>Coba lagi</Button>}>
    Layanan mungkin sedang tidak tersedia. Coba lagi nanti.
  </StatusMessage>
  return <StatusMessage tone="empty" title={receiptStatusLabel(state.reportStatus)}>
    {state.reportStatus === "reviewed" ? <p>{DITINJAU_COPY}</p> : null}
    {state.reportStatus === "pending" ? <p>Laporan tersimpan dan menunggu tinjauan moderator.</p> : null}
    {state.reportStatus === "rejected" ? <p>Laporan ini tidak ditampilkan pada laporan warga.</p> : null}
    <p>Simpan tautan ini secara privat. Siapa pun yang memilikinya dapat melihat status. Foto, alias, dan catatan moderator tidak ditampilkan.</p>
    <Button onClick={retry}>Periksa lagi</Button>
  </StatusMessage>
}
