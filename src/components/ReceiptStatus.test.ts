import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ReceiptStatus, type ReceiptRequestState } from "./ReceiptStatus.tsx"

const render = (state: ReceiptRequestState) => renderToStaticMarkup(createElement(ReceiptStatus, { state, retry: () => {} }))

it.effect("private receipt UI has honest loading, denial, and recoverable service states", () => Effect.sync(() => {
  assert.ok(render({ status: "loading" }).includes("Memuat status laporan"))
  assert.ok(render({ status: "loading" }).includes('aria-busy="true"'))
  assert.ok(render({ status: "denied" }).includes("Nomor laporan saja tidak membuka status"))
  assert.ok(render({ status: "unavailable" }).includes("Coba lagi"))
}))

it.effect("safe status UI explains moderation and never renders photo controls", () => Effect.sync(() => {
  for (const reportStatus of ["pending", "reviewed", "rejected"] as const) {
    const html = render({ status: "ready", reportStatus })
    assert.ok(html.includes("Simpan tautan ini secara privat"))
    assert.ok(!html.includes("<img"))
    if (reportStatus === "reviewed") assert.ok(html.includes("Bukan verifikasi resmi"))
    if (reportStatus === "pending") assert.ok(html.includes("menunggu tinjauan moderator"))
    if (reportStatus === "rejected") assert.ok(html.includes("tidak ditampilkan"))
  }
}))
