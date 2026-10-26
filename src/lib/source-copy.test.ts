import { Effect, TestClock } from "effect"
import { assert, it } from "@effect/vitest"
import { applyFreshPrices, clearFreshPrices } from "#/data/fresh-prices.ts"
import { SNAPSHOT_META } from "#/data/snapshot.gen.ts"
import { dataBadge, dataBadgeTone, latestLiveDate, pageSourceNote } from "#/data/provider.ts"
import { todayInJakarta } from "#/lib/jakarta-today.ts"
import { homeSelectedDate } from "#/lib/commodity-search.ts"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ProvincePanel } from "#/components/ProvincePanel.tsx"
import { WageProvenance } from "#/components/WageProvenance.tsx"
import { UMP_SOURCE_NOTE } from "#/data/wages.ts"

it.effect("wage provenance states the incomplete decree checks and limits the cross-check date", () => Effect.sync(() => {
  const html = renderToStaticMarkup(createElement(WageProvenance))
  assert.ok(html.includes(UMP_SOURCE_NOTE))
  assert.ok(html.includes("verifikasi nomor SK per provinsi belum tuntas"))
  assert.ok(html.includes("25 September 2026"))
  assert.ok(html.includes("bukan bukti verifikasi setiap Kepgub"))
  assert.ok(!html.includes("terakhir diverifikasi"))
  assert.ok(!html.includes("href="))
}))

const JAKARTA_28_SEP = 1790579700000

it.effect("header badge warns only for sample data", () => Effect.sync(() => {
  assert.strictEqual(dataBadgeTone("Data contoh"), "ember")
  assert.strictEqual(dataBadgeTone(dataBadge(latestLiveDate())), "neutral")
  assert.strictEqual(dataBadgeTone("Memuat data…"), "neutral")
}))

it.effect("live PIHPS page notes never claim sample data", () =>
  Effect.sync(() => {
    assert.strictEqual(SNAPSHOT_META.pricesLive, true)
    const badge = dataBadge(latestLiveDate())
    assert.ok(badge.includes("PIHPS"))
    const note = pageSourceNote(latestLiveDate(), "2026-09-28")
    assert.strictEqual(note, `Harga dari PIHPS: 16 September 2026. Bukan harga hari ini.`)
    assert.ok(!/terbaru/i.test(note))
    assert.ok(!/data contoh/i.test(note))
    assert.ok(!/Data contoh/.test(note))
    assert.ok(note.includes("PIHPS"))
  }),
)

it.effect("a pinned home selection produces matching PIHPS header and footer dates", () => Effect.sync(() => {
  const date = homeSelectedDate({ tanggal: "2017-03-27" }, ["2017-03-27", latestLiveDate()], latestLiveDate())
  assert.ok(dataBadge(date).includes("27 Maret 2017"))
  assert.ok(pageSourceNote(date, "2026-10-19").includes("27 Maret 2017"))
  assert.ok(!dataBadge(date).includes("Data contoh"))
}))

it.effect("an unpriced province shows no price comparison or relative statistics", () => Effect.sync(() => {
  const html = renderToStaticMarkup(createElement(ProvincePanel, {
    commodityName: "Beras", provinceName: "Papua", price: null, average: 15000,
    min: 10000, max: 20000, unit: "kg", date: "2026-09-16",
  }))
  assert.ok(html.includes("Tidak ada data"))
  assert.ok(!html.includes("vs nasional"))
  assert.ok(!html.includes("Termurah"))
  assert.ok(!html.includes("Rp 0"))
}))

it.effect("page note denies today only when the PIHPS day is older", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(JAKARTA_28_SEP)
    const today = yield* todayInJakarta()
    assert.strictEqual(today, "2026-09-28")
    assert.strictEqual(
      pageSourceNote("2026-09-01", today),
      "Harga dari PIHPS: 1 September 2026. Bukan harga hari ini.",
    )
    applyFreshPrices({
      latestDate: today,
      dates: [today],
      prices: { [`${today}:beras:31`]: 16950 },
    })
    assert.strictEqual(pageSourceNote(today, today), "Harga dari PIHPS: 28 September 2026.")
    assert.ok(!pageSourceNote(today, today).includes("Bukan harga hari ini"))
  }).pipe(Effect.ensuring(Effect.sync(() => clearFreshPrices()))),
)
