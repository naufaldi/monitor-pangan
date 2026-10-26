import { Schema } from "effect"
import { ReceiptTokenSchema, type ReportStatus } from "./laporan.ts"

export type ReceiptCredentials = { readonly id: string; readonly token: string }

/** Fragments stay on the client; only the report id belongs in a server URL. */
export function receiptLink(id: string, token: string): string {
  return `/laporan-status?id=${encodeURIComponent(id)}#receipt=${encodeURIComponent(token)}`
}

export function parseReceiptCredentials(id: unknown, fragment: string): ReceiptCredentials | null {
  const token = new URLSearchParams(fragment.replace(/^#/, "")).get("receipt")
  return Schema.is(Schema.UUID)(id) && Schema.is(ReceiptTokenSchema)(token) ? { id, token } : null
}

export function receiptStatusLabel(status: ReportStatus): string {
  switch (status) {
    case "pending": return "Menunggu tinjauan"
    case "reviewed": return "Ditinjau"
    case "rejected": return "Ditolak"
    default: { const exhaustive: never = status; return exhaustive }
  }
}
