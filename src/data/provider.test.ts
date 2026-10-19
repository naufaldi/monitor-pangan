import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { applyFreshPrices, clearFreshPrices, STATIC_LIVE_THROUGH } from "./fresh-prices.ts"
import { LIVE_PRICES } from "./prices.gen.ts"
import { SNAPSHOT_META } from "./snapshot.gen.ts"
import { decodeSnapshot } from "./price-schema.ts"
import { dataBadge, isSnapshotLoaded, latestLiveDate, liveSurveyDates, pageSourceNote, provider } from "./provider.ts"

const LIVE_DATE = "2026-09-16"
const SAMPLE_DATE = "2026-09-17"
const MISSING_LIVE_PROVINCES = ["21", "61", "65", "93", "94", "95", "96"]

it.effect("invalid fresh observations become missing rows in schema-valid snapshots", () =>
  Effect.gen(function*() {
    for (const price of [0, -100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      applyFreshPrices({
        latestDate: "2026-09-28",
        dates: ["2026-09-28"],
        prices: { "2026-09-28:beras:31": price },
      })
      const snapshot = provider.snapshot("2026-09-28", "beras")
      assert.strictEqual(snapshot.rows.find((row) => row.regionCode === "31")?.price, null)
      assert.strictEqual(snapshot.nationalAvg, null)
      assert.strictEqual(snapshot.pricedCount, 0)
      assert.strictEqual(isSnapshotLoaded("2026-09-28", "beras"), false)
      yield* decodeSnapshot(snapshot)
    }
  }).pipe(Effect.ensuring(Effect.sync(() => clearFreshPrices()))))

it.effect("an invalid fresh cell does not discard valid provincial observations", () =>
  Effect.gen(function*() {
    applyFreshPrices({
      latestDate: "2026-09-28",
      dates: ["2026-09-28"],
      prices: { "2026-09-28:beras:31": 0, "2026-09-28:beras:32": 16950 },
    })
    const snapshot = provider.snapshot("2026-09-28", "beras")
    assert.strictEqual(snapshot.rows.find((row) => row.regionCode === "31")?.price, null)
    assert.strictEqual(snapshot.rows.find((row) => row.regionCode === "32")?.price, 16950)
    assert.strictEqual(snapshot.nationalAvg, 16950)
    assert.strictEqual(snapshot.pricedCount, 1)
    assert.strictEqual(isSnapshotLoaded("2026-09-28", "beras"), true)
    yield* decodeSnapshot(snapshot)
  }).pipe(Effect.ensuring(Effect.sync(() => clearFreshPrices()))))

it.effect("metadata-only history has no bundled national price", () => Effect.sync(() => {
  const date = "2017-03-27"
  assert.ok(SNAPSHOT_META.liveDates.includes(date))
  assert.ok(provider.dates().includes(date))
  assert.strictEqual(isSnapshotLoaded(date, "beras"), false)
  const snapshot = provider.snapshot(date, "beras")
  assert.ok(snapshot.rows.every((row) => row.price === null))
  assert.strictEqual(snapshot.nationalAvg, null)
  assert.strictEqual(snapshot.pricedCount, 0)
}))

it.effect("live PIHPS snapshot does not invent prices for missing provinces", () =>
  Effect.gen(function*() {
    const snapshot = provider.snapshot(LIVE_DATE, "beras")
    assert.strictEqual(dataBadge(LIVE_DATE), "Data 16 September 2026 · PIHPS eceran")
    assert.strictEqual(STATIC_LIVE_THROUGH, LIVE_DATE)
    assert.strictEqual(SNAPSHOT_META.liveDates.at(-1), STATIC_LIVE_THROUGH)
    for (const code of MISSING_LIVE_PROVINCES) {
      assert.strictEqual(LIVE_PRICES[`${LIVE_DATE}:beras:${code}`], undefined)
      const row = snapshot.rows.find((r) => r.regionCode === code)
      assert.notEqual(row, undefined)
      assert.strictEqual(row?.price, null)
    }
    for (const row of snapshot.rows) {
      const live = LIVE_PRICES[`${LIVE_DATE}:beras:${row.regionCode}`]
      if (live === undefined) {
        assert.strictEqual(row.price, null)
      } else {
        assert.strictEqual(row.price, live)
      }
    }
  }))

it.effect("live nationalAvg averages only real PIHPS cells", () =>
  Effect.gen(function*() {
    const snapshot = provider.snapshot(LIVE_DATE, "beras")
    const livePrices = snapshot.rows
      .map((r) => r.price)
      .filter((price): price is number => price != null)
    assert.ok(livePrices.length > 0)
    assert.ok(livePrices.length < snapshot.rows.length)
    const expected =
      Math.round(livePrices.reduce((sum, price) => sum + price, 0) / livePrices.length / 50) * 50
    assert.strictEqual(snapshot.nationalAvg, expected)
    assert.strictEqual(snapshot.pricedCount, livePrices.length)
    assert.strictEqual(isSnapshotLoaded(LIVE_DATE, "beras"), true)
    const polluted =
      Math.round(
        snapshot.rows.reduce((sum, r) => sum + (r.price ?? 0), 0) / snapshot.rows.length / 50,
      ) * 50
    assert.notEqual(snapshot.nationalAvg, polluted)
  }))

it.effect("live survey dates exclude sample fallback days", () =>
  Effect.gen(function*() {
    assert.ok(!liveSurveyDates().includes(SAMPLE_DATE))
    assert.ok(liveSurveyDates().includes(LIVE_DATE))
  }))

it.effect("sample dates may fill mock prices only when the badge is Data contoh", () =>
  Effect.gen(function*() {
    assert.ok(!SNAPSHOT_META.liveDates.includes(SAMPLE_DATE))
    assert.strictEqual(dataBadge(SAMPLE_DATE), "Data contoh")
    const snapshot = provider.snapshot(SAMPLE_DATE, "beras")
    assert.ok(snapshot.rows.every((r) => r.price != null && r.price > 0))
    assert.strictEqual(snapshot.pricedCount, snapshot.rows.length)
  }))

it.effect("day trend skips null selected-province prices instead of padding zeros", () =>
  Effect.gen(function*() {
    const series = provider.trend("beras", "93", {
      from: "2026-09-14",
      to: "2026-09-16",
      resolution: "day",
    })
    assert.ok(series.selected != null)
    assert.strictEqual(series.selected?.length, 0)
    assert.ok(series.national.every((p) => p.price > 0))
  }))

it.effect("a D1 overlay newer than the baked snapshot becomes the price on screen", () =>
  Effect.gen(function* () {
    const before = provider
      .trend("beras", null, { from: "2026-09-01", to: "2026-09-16", resolution: "month" })
      .national.find((point) => point.date === "2026-09-01")
    assert.strictEqual(latestLiveDate(), LIVE_DATE)
    applyFreshPrices({
      latestDate: "2026-09-28",
      dates: ["2026-09-28"],
      prices: { "2026-09-28:beras:31": 16950 },
    })
    assert.strictEqual(latestLiveDate(), "2026-09-28")
    assert.ok(provider.dates().includes("2026-09-28"))
    assert.ok(!provider.dates().includes(SAMPLE_DATE))
    const snapshot = provider.snapshot("2026-09-28", "beras")
    assert.strictEqual(snapshot.rows.find((row) => row.regionCode === "31")?.price, 16950)
    assert.strictEqual(snapshot.rows.find((row) => row.regionCode === "32")?.price, null)
    assert.strictEqual(snapshot.nationalAvg, 16950)
    assert.strictEqual(snapshot.pricedCount, 1)
    assert.strictEqual(isSnapshotLoaded("2026-09-28", "beras"), true)
    assert.strictEqual(isSnapshotLoaded("2026-09-28", "cabai-merah"), false)
    const missingCommodity = provider.snapshot("2026-09-28", "cabai-merah")
    assert.strictEqual(missingCommodity.nationalAvg, null)
    assert.strictEqual(missingCommodity.pricedCount, 0)
    assert.strictEqual(
      pageSourceNote("2026-09-28", "2026-09-28"),
      "Harga dari PIHPS: 28 September 2026.",
    )
    const day = provider.trend("beras", null, {
      from: "2026-09-16",
      to: "2026-09-28",
      resolution: "day",
    })
    assert.deepStrictEqual(
      day.national.map((point) => point.date),
      ["2026-09-16", "2026-09-28"],
    )
    const month = provider.trend("beras", null, {
      from: "2026-09-01",
      to: "2026-09-28",
      resolution: "month",
    })
    const after = month.national.find((point) => point.date === "2026-09-01")
    assert.ok(before != null && after != null)
    assert.notStrictEqual(after.price, before.price)
    clearFreshPrices()
    assert.strictEqual(latestLiveDate(), LIVE_DATE)
    assert.strictEqual(isSnapshotLoaded("2026-09-28", "beras"), false)
  }).pipe(Effect.ensuring(Effect.sync(() => clearFreshPrices()))))
