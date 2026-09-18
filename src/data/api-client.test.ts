import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { afterEach, vi } from "vitest"
import { fetchSnapshot, fetchTrend } from "./api-client.ts"

const BERAS = {
  id: "beras",
  name: "Beras",
  unit: "kg",
  group: "Bahan pokok",
  anchor: 13500,
}

const stubFetch = (handler: (url: string) => unknown) => {
  vi.stubGlobal(
    "fetch",
    (url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(handler(url)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it.effect("fetchSnapshot decodes a validated snapshot", () =>
  Effect.gen(function*() {
    stubFetch(() => ({
      date: "2025-10-30",
      commodity: BERAS,
      nationalAvg: 15750,
      pricedCount: 1,
      rows: [{ regionCode: "11", price: 14600 }],
    }))
    const snapshot = yield* fetchSnapshot("2025-10-30", "beras")
    assert.strictEqual(snapshot.date, "2025-10-30")
    assert.strictEqual(snapshot.nationalAvg, 15750)
    assert.strictEqual(snapshot.pricedCount, 1)
  }))

it.effect("fetchSnapshot maps HTTP failures to ApiClientError", () =>
  Effect.gen(function*() {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("boom", { status: 500 })))
    const failure = yield* Effect.flip(fetchSnapshot("2025-10-30", "beras"))
    assert.strictEqual(failure._tag, "ApiClientError")
  }))

it.effect("fetchTrend follows cursors and derives change and direction", () =>
  Effect.gen(function*() {
    stubFetch((url) => {
      const params = new URL(url, "http://local").searchParams
      if (params.get("cursor") == null) {
        return {
          commodity: BERAS,
          national: [{ date: "2025-10-01", price: 100 }],
          selected: [{ date: "2025-10-01", price: 90 }],
          nextCursor: "2025-10-01",
        }
      }
      return {
        commodity: BERAS,
        national: [{ date: "2025-10-02", price: 110 }],
        selected: [{ date: "2025-10-02", price: 99 }],
        nextCursor: null,
      }
    })
    const series = yield* fetchTrend("beras", "11", { from: "2025-10-01", to: "2025-10-02" })
    assert.strictEqual(series.national.length, 2)
    assert.strictEqual(series.selected?.length, 2)
    assert.strictEqual(series.changePct, 10)
    assert.strictEqual(series.direction, "up")
    assert.strictEqual(series.range.resolution, "day")
  }))

it.effect("fetchTrend rejects unknown commodities without fetching", () =>
  Effect.gen(function*() {
    const seen: string[] = []
    stubFetch((url) => {
      seen.push(url)
      return {}
    })
    const failure = yield* Effect.flip(fetchTrend("nope", null, { from: "2025-10-01", to: "2025-10-02" }))
    assert.strictEqual(failure._tag, "ApiClientError")
    assert.strictEqual(seen.length, 0)
  }))
