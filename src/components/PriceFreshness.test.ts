import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { healthStatusCopy, PriceFreshness, SnapshotCoverage } from "./PriceFreshness.tsx"
import type { FreshnessState } from "#/data/vintage.tsx"
import { formatHealthTime } from "#/data/health-copy.ts"

it.effect("health timestamps use readable Jakarta dates including UTC day boundaries", () => Effect.sync(() => {
  const label = formatHealthTime("2026-10-25T18:30:00.000Z")
  assert.ok(label.includes("26 Oktober 2026"))
  assert.match(label, /01[.:]30/)
  assert.ok(label.endsWith("WIB"))
  assert.strictEqual(formatHealthTime(null), "belum tersedia")
}))

it.effect("does not attribute an unresolved survey to upstream publication and keeps error/loading copy distinct", () => Effect.sync(() => {
  const base: FreshnessState = { status: "ready", refreshFailed: false, healthFailed: false, health: null }
  assert.ok(healthStatusCopy({ ...base, status: "loading" }).includes("Memeriksa"))
  assert.ok(healthStatusCopy({ ...base, healthFailed: true }).includes("belum dapat"))
  for (const status of ["ok", "waiting", "degraded", "unavailable"] as const) {
    const text = healthStatusCopy({ ...base, health: { status, checkedAt: "2026-10-26T00:00:00Z", latestCheckedDate: null, latestPricedDate: null, oldestUnresolvedDate: null, lastAttemptAt: null, lastAttemptOutcome: null, lastSuccessfulRunAt: null } })
    if (status === "waiting") {
      assert.strictEqual(text, "Pembaruan PIHPS hari ini belum terkonfirmasi.")
      assert.ok(!text.includes("publikasi"))
      assert.ok(!text.includes("gagal"))
    }
    if (status === "degraded") assert.ok(text.includes("belum lengkap"))
    if (status === "unavailable") assert.ok(text.includes("tidak tersedia"))
  }
}))

it.effect("explains weekday ingestion, the weekend gap, and the read-only refresh action", () => Effect.sync(() => {
  const html = renderToStaticMarkup(createElement(PriceFreshness))
  assert.ok(html.includes("Senin–Jumat pukul 14.15 dan 17.15 WIB"))
  assert.ok(html.includes("Tidak ada pemeriksaan terjadwal pada akhir pekan"))
  assert.ok(html.includes("memuat ulang harga dan status layanan"))
  assert.ok(html.includes("tidak menjalankan pengambilan harga dari PIHPS"))
}))

it.effect("coverage describes the selected snapshot including confirmed empty observations", () => Effect.sync(() => {
  for (const count of [0, 34, 38]) {
    const html = renderToStaticMarkup(createElement(SnapshotCoverage, { pricedCount: count, total: 38, date: "2026-10-23" }))
    assert.ok(html.includes(`${count} dari 38`))
    assert.ok(html.includes("23 Oktober 2026"))
    assert.ok(html.includes("bukan nol"))
  }
}))

it.effect("compact coverage preserves the date and missing-data explanation for assistive reading", () => Effect.sync(() => {
  const html = renderToStaticMarkup(createElement(SnapshotCoverage, { pricedCount: 31, total: 38, date: "2026-10-26", compact: true }))
  assert.ok(html.includes("31 dari 38 provinsi"))
  assert.ok(html.includes("26 Oktober 2026"))
  assert.ok(html.includes("bukan nol"))
}))
