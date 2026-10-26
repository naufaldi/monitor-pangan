import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BasketSummary } from "./BasketSummary.tsx"
import type { BasketEstimate, BasketTotal } from "#/lib/basket.ts"

function render(current: BasketTotal, previous: BasketTotal = { status: "incomplete" }) {
  const estimate: BasketEstimate = { lines: [], current, previous, selectedCount: 2, changeRp: null, changePct: null }
  return renderToStaticMarkup(createElement(BasketSummary, { estimate, date: "2026-09-16", comparisonDate: "2026-09-15" }))
}

it.effect("shows a current total when only its comparison is incomplete and names both actual dates", () => Effect.sync(() => {
  const html = render({ status: "complete", total: 37500 })
  assert.ok(html.includes("Rp 37.500"))
  assert.ok(html.includes("16 September 2026"))
  assert.ok(html.includes("15 September 2026"))
  assert.ok(html.includes("Belum dapat dibandingkan"))
  assert.ok(html.includes("Total untuk tanggal yang belum lengkap tidak ditampilkan"))
  assert.ok(!html.includes("Rp 0"))
}))

it.effect("explains empty and invalid input without presenting them as zero-cost baskets", () => Effect.sync(() => {
  assert.ok(render({ status: "empty" }).includes("Isi jumlah terlebih dahulu"))
  const invalid = render({ status: "invalid" })
  assert.ok(invalid.includes("Perbaiki jumlah yang ditandai"))
  assert.ok(!invalid.includes("Rp 0"))
}))
