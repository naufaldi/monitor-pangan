import { Effect, Ref } from "effect"
import { assert, it } from "@effect/vitest"
import { COMMODITIES } from "#/data/catalog.ts"
import { PriceFetchError } from "#/data/api-client.ts"
import type { Snapshot } from "#/data/provider.ts"
import { cachedOverview, loadProvinceOverview, provinceOverviewRows, type OverviewReader } from "./province-overview.ts"

const date = "2026-09-16"
const previousDate = "2026-09-15"
const snap = (day: string, id: string, price: number | null = 120): Snapshot => ({
  date: day, commodity: COMMODITIES.find((commodity) => commodity.id === id)!,
  nationalAvg: 100, pricedCount: price == null ? 1 : 2,
  rows: [{ regionCode: "31", price }, { regionCode: "32", price: price === 120 ? 80 : 100 }, { regionCode: "95", price: null }],
})
const allCached: OverviewReader = { cached: (day, id) => snap(day, id, day === date ? 120 : 100), load: () => Effect.die("Cache should avoid a request") }

it.effect("projects all ten prices from one survey date with same-day national comparisons", () => Effect.sync(() => {
  const overview = cachedOverview(date, previousDate, allCached)
  const rows = provinceOverviewRows(overview, "31")
  assert.strictEqual(rows.length, 10)
  assert.ok(rows.every((row) => row.price === 120 && row.national === 100 && row.nationalPct === 20 && row.changePct === 20))
  assert.strictEqual(overview.date, date)
  assert.strictEqual(overview.previousDate, previousDate)
  assert.strictEqual(rows.at(-1)?.commodity.unit, "liter")
  assert.ok(provinceOverviewRows(overview, "95").every((row) => row.price == null && row.changePct == null && row.nationalPct == null))
}))

it.effect("does not substitute wrong dates, national prices or unsupported comparison observations", () => Effect.sync(() => {
  const wrong: OverviewReader = { ...allCached, cached: (_day, id) => snap("2026-09-14", id) }
  assert.ok(cachedOverview(date, previousDate, wrong).entries.every((entry) => entry.current.status === "loading"))
  for (const price of [null, 0, NaN, Infinity, -10]) {
    const rows = provinceOverviewRows(cachedOverview(date, previousDate, { ...allCached, cached: (day, id) => snap(day, id, price) }), "31")
    assert.ok(rows.every((row) => row.price == null && row.changePct == null && row.nationalPct == null))
  }
  assert.ok(provinceOverviewRows(cachedOverview(date, null, allCached), "31").every((row) => row.changePct == null))
  assert.ok(provinceOverviewRows(cachedOverview(date, date, allCached), "31").every((row) => row.changePct == null))
}))

it.effect("loads only missing snapshots with at most three concurrent reads and preserves partial failures", () => Effect.gen(function* () {
  const active = yield* Ref.make(0)
  const peak = yield* Ref.make(0)
  const calls = yield* Ref.make<string[]>([])
  const reader: OverviewReader = {
    cached: (day, id) => id === "beras" ? snap(day, id) : null,
    load: (day, id) => Effect.gen(function* () {
      yield* Ref.update(calls, (values) => [...values, `${day}:${id}`])
      const count = yield* Ref.updateAndGet(active, (n) => n + 1)
      yield* Ref.update(peak, (n) => Math.max(n, count))
      yield* Effect.yieldNow()
      return yield* id === "cabai-merah"
        ? Effect.fail(new PriceFetchError({ kind: "coverage", message: "Unavailable fixture" }))
        : Effect.succeed(snap(day, id))
    }).pipe(Effect.ensuring(Ref.update(active, (n) => n - 1))),
  }
  const overview = yield* loadProvinceOverview(date, previousDate, reader)
  assert.strictEqual((yield* Ref.get(calls)).length, 18)
  assert.strictEqual(yield* Ref.get(peak), 3)
  assert.strictEqual(overview.entries.filter((entry) => entry.current.status === "ready").length, 9)
  assert.strictEqual(overview.entries.find((entry) => entry.commodity.id === "cabai-merah")?.current.status, "error")
  assert.strictEqual(provinceOverviewRows(overview, "31").filter((row) => row.price != null).length, 9)
}))

it.effect("retry reuses successful snapshots and requests only failed cells", () => Effect.gen(function* () {
  const stored = new Map<string, Snapshot>()
  const calls: string[] = []
  let fail = true
  const reader: OverviewReader = {
    cached: (day, id) => stored.get(`${day}:${id}`) ?? null,
    load: (day, id) => Effect.suspend(() => {
      calls.push(`${day}:${id}`)
      if (fail && id === "beras") return Effect.fail(new PriceFetchError({ kind: "request", message: "Offline fixture" }))
      const snapshot = snap(day, id)
      stored.set(`${day}:${id}`, snapshot)
      return Effect.succeed(snapshot)
    }),
  }
  const first = yield* loadProvinceOverview(date, null, reader)
  assert.strictEqual(first.entries[0]?.current.status, "error")
  fail = false
  const retried = yield* loadProvinceOverview(date, null, reader)
  assert.strictEqual(calls.length, 11)
  assert.ok(retried.entries.every((entry) => entry.current.status === "ready"))
  const wrong = yield* loadProvinceOverview(date, null, { ...reader, cached: () => null, load: (_day, id) => Effect.succeed(snap(previousDate, id)) })
  assert.ok(wrong.entries.every((entry) => entry.current.status === "error"))
}))
