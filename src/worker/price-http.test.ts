import { assert, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { COMMODITIES } from "../data/catalog.ts"
import { REGION_ROWS } from "../data/pihps-catalog.ts"
import { handlePriceRequest } from "./price-http.ts"
import { CoverageUnavailable, PriceReadError, PriceReadStore } from "./price-store.ts"

const emptySnapshot = { date: "2024-02-29", commodity: COMMODITIES[0]!, nationalAvg: null, pricedCount: 0, rows: REGION_ROWS.map(([regionCode]) => ({ regionCode, price: null })) }
const readLayer = Layer.succeed(PriceReadStore, {
  snapshot: () => Effect.succeed(emptySnapshot),
  trendPage: (query) => Effect.succeed({ national: [{ date: query.from, price: query.limit }], selected: query.regionCode == null ? null : [], nextCursor: null }),
})
const request = (query: string, method = "GET") => handlePriceRequest(new Request(`https://example.test${query}`, { method }))
const body = (response: Response) => Effect.promise(() => response.json() as Promise<Record<string, unknown>>)

it.effect("parses leap dates, defaults and optional selected region", () => Effect.gen(function* () {
  assert.strictEqual((yield* request("/api/snapshot?date=2024-02-29&commodity=beras"))?.status, 200)
  const response = yield* request("/api/trend?commodity=beras&from=2024-02-29&to=2024-03-01")
  assert.deepStrictEqual(yield* body(response!), { national: [{ date: "2024-02-29", price: 500 }], selected: null, nextCursor: null })
  assert.strictEqual((yield* request("/api/trend?commodity=beras&region=93&from=2024-02-29&to=2024-03-01&limit=2000&cursor=2024-03-01"))?.status, 200)
  assert.strictEqual(yield* request("/unrelated"), null)
}).pipe(Effect.provide(readLayer)))

for (const query of [
  "/api/snapshot?date=2023-02-29&commodity=beras", "/api/snapshot?date=2024-04-31&commodity=beras", "/api/snapshot?date=2024-13-01&commodity=beras", "/api/snapshot?date=0000-01-01&commodity=beras", "/api/snapshot?date=2024-02-29&commodity=nope", "/api/snapshot?commodity=beras",
  ...["region=99", "region=", "limit=0", "limit=2001", "limit=1.5", "limit=1e2", "limit=", "cursor=2024-02-28", "cursor=2024-03-02", "cursor=garbage", "from=2024-03-02"].map((extra) => `/api/trend?commodity=beras&from=2024-02-29&to=2024-03-01&${extra}`),
]) it.effect(`rejects invalid query ${query}`, () => Effect.gen(function* () {
  assert.strictEqual((yield* request(query))?.status, 400)
}).pipe(Effect.provide(readLayer)))

it.effect("returns 405, safe store failures and stable coverage failures", () => Effect.gen(function* () {
  assert.strictEqual((yield* request("/api/snapshot", "POST").pipe(Effect.provide(readLayer)))?.status, 405)
  for (const error of [new PriceReadError({ message: "secret SQL" }), new CoverageUnavailable({ from: "2024-02-29", to: "2024-02-29" })]) {
    const layer = Layer.succeed(PriceReadStore, { snapshot: () => Effect.fail(error), trendPage: () => Effect.fail(error) })
    const response = yield* request("/api/snapshot?date=2024-02-29&commodity=beras").pipe(Effect.provide(layer))
    assert.strictEqual(response?.status, error._tag === "CoverageUnavailable" ? 503 : 500)
    assert.deepStrictEqual(yield* body(response!), { error: error._tag === "CoverageUnavailable" ? "coverage_unavailable" : "price_read_failed" })
  }
}))

it.effect("rejects malformed store output before serializing successful API responses", () => Effect.gen(function* () {
  const layer = Layer.succeed(PriceReadStore, {
    snapshot: () => Effect.succeed({ ...emptySnapshot, rows: [] }),
    trendPage: () => Effect.succeed({ national: [{ date: "2024-02-29", price: Number.POSITIVE_INFINITY }], selected: null, nextCursor: null }),
  })
  for (const path of ["/api/snapshot?date=2024-02-29&commodity=beras", "/api/trend?commodity=beras&from=2024-02-29&to=2024-03-01"]) {
    const response = yield* request(path).pipe(Effect.provide(layer))
    assert.strictEqual(response?.status, 500)
    assert.deepStrictEqual(yield* body(response!), { error: "price_read_failed" })
  }
}))
