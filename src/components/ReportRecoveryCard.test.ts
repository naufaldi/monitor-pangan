import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ReportRecoveryCard } from "./ReportRecoveryCard.tsx"

const render = (overrides: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ReportRecoveryCard, {
      commodityName: "Beras",
      priceLabel: "Rp 16.000/kg",
      placeName: "Kota Bandung",
      hasPhoto: false,
      pending: false,
      error: null,
      onRetry: () => {},
      onNewReport: () => {},
      ...overrides,
    }),
  )

it.effect("recovery explains the original may be stored and offers both retry and new-report", () =>
  Effect.sync(() => {
    const html = render()
    assert.ok(html.includes("Laporan ini mungkin sudah tersimpan."))
    assert.ok(html.includes("Mengubah isian tidak memperbarui laporan itu."))
    assert.ok(html.includes("Kirim ulang laporan"))
    assert.ok(html.includes("Mulai laporan baru"))
    // It shows the original attempt as read-only values, not editable fields.
    assert.ok(html.includes("Beras"))
    assert.ok(html.includes("Rp 16.000/kg"))
    assert.ok(html.includes("Kota Bandung"))
    assert.ok(html.includes("Tidak ada"))
    assert.ok(!html.includes("<input"))
    assert.ok(!html.includes("<form"))
    assert.ok(render({ hasPhoto: true }).includes("Ada"))
  }),
)

it.effect("recovery surfaces a retry error and disables both actions while pending", () =>
  Effect.sync(() => {
    const html = render({ pending: true, error: "Belum dapat memastikan laporan tersimpan. Coba lagi." })
    assert.ok(html.includes("Mengirim ulang…"))
    assert.ok(html.includes("Belum dapat memastikan laporan tersimpan. Coba lagi."))
    assert.ok(html.includes('aria-busy="true"'))
    assert.ok(html.includes("disabled"))
  }),
)

it.effect("the new-report hint warns that the previous attempt may already be stored", () =>
  Effect.sync(() => {
    assert.ok(render().includes("dapat membuat laporan ganda"))
  }),
)