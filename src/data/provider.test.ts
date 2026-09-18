import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { LIVE_PRICES } from "./prices.gen.ts"
import { SNAPSHOT_META } from "./snapshot.gen.ts"
import { dataBadge, bundledSnapshotDates, liveSurveyDates, provider } from "./provider.ts"

const LIVE_DATE = "2026-09-16"
const SAMPLE_DATE = "2026-09-17"
const MISSING_LIVE_PROVINCES = ["21", "61", "65", "93", "94", "95", "96"]

it.effect("live PIHPS snapshot does not invent prices for missing provinces", () =>
  Effect.gen(function*() {
    const snapshot = provider.snapshot(LIVE_DATE, "beras")
    assert.strictEqual(dataBadge(LIVE_DATE), `Data ${LIVE_DATE} · PIHPS eceran`)
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
  }))

it.effect("bundled snapshot reports zero priced rows for live-but-unbundled dates", () =>
  Effect.gen(function*() {
    const snapshot = provider.snapshot("2025-10-30", "beras")
    assert.strictEqual(snapshot.pricedCount, 0)
    assert.ok(snapshot.rows.every((r) => r.price == null))
  }))

it.effect("bundled snapshot reports priced rows for bundled live dates", () =>
  Effect.gen(function*() {
    const snapshot = provider.snapshot(LIVE_DATE, "beras")
    assert.ok(snapshot.pricedCount > 0)
    assert.strictEqual(
      snapshot.pricedCount,
      snapshot.rows.filter((r) => r.price != null).length,
    )
  }))

it.effect("bundled snapshot dates cover only the recent window", () =>
  Effect.gen(function*() {
    const bundled = bundledSnapshotDates()
    assert.ok(bundled.includes(LIVE_DATE))
    assert.ok(!bundled.includes("2025-10-30"))
    assert.deepStrictEqual(bundled, [...bundled].sort())
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
