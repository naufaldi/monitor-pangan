import { assert, it } from "@effect/vitest"
import { Effect, Either, Fiber } from "effect"
import { fetchSnapshot, fetchTrend } from "./api-client.ts"
import { COMMODITIES } from "./catalog.ts"
import { REGION_ROWS } from "./pihps-catalog.ts"
import { addIsoDays } from "#/lib/civil-date.ts"
import { handlePriceRequest } from "../worker/price-http.ts"
import { priceReadStoreLayer } from "../worker/price-store.ts"
import { sqliteFixture } from "../worker/sqlite-test.ts"

const emptySnapshot = {
  date: "2017-03-27", commodity: COMMODITIES[0]!, nationalAvg: null, pricedCount: 0,
  rows: REGION_ROWS.map(([regionCode]) => ({ regionCode, price: null })),
}
const transport = (body: unknown, status = 200): typeof fetch => () => Promise.resolve(Response.json(body, { status }))

it.effect("decodes confirmed empty snapshots without manufacturing zero prices", () => Effect.gen(function* () {
  const snapshot = yield* fetchSnapshot("2017-03-27", "beras", transport(emptySnapshot))
  assert.strictEqual(snapshot.nationalAvg, null)
  assert.strictEqual(snapshot.pricedCount, 0)
  assert.strictEqual(snapshot.rows.length, 38)
}))

it.effect("rejects malformed payloads and responses for another request", () => Effect.gen(function* () {
  for (const body of [{}, { ...emptySnapshot, date: "2017-03-28" }, { ...emptySnapshot, commodity: COMMODITIES[1]! }, { ...emptySnapshot, rows: [] }]) {
    const result = yield* Effect.either(fetchSnapshot("2017-03-27", "beras", transport(body)))
    assert.ok(Either.isLeft(result))
    if (Either.isLeft(result)) assert.strictEqual(result.left.kind, "request")
  }
}))

it.effect("separates coverage failures from server, JSON and network errors", () => Effect.gen(function* () {
  const malformed: typeof fetch = () => Promise.resolve(new Response("{not json"))
  const offline: typeof fetch = () => Promise.reject(new Error("offline"))
  for (const [fetcher, kind] of [[transport({}, 503), "coverage"], [transport({}, 500), "request"], [malformed, "request"], [offline, "request"]] as const) {
    const result = yield* Effect.either(fetchSnapshot("2017-03-27", "beras", fetcher))
    assert.ok(Either.isLeft(result))
    if (Either.isLeft(result)) assert.strictEqual(result.left.kind, kind)
  }
}))

it.effect("validates the outgoing query and uses the snapshot API contract", () => Effect.gen(function* () {
  let url = ""
  const fetcher: typeof fetch = (input) => {
    url = String(input)
    return Promise.resolve(Response.json(emptySnapshot))
  }
  yield* fetchSnapshot("2017-03-27", "beras", fetcher)
  assert.strictEqual(url, "/api/snapshot?date=2017-03-27&commodity=beras")
  const invalid = yield* Effect.either(fetchSnapshot("2017-02-30", "beras", fetcher))
  assert.ok(Either.isLeft(invalid))
}))

it.effect("follows every trend cursor and combines national and selected observations", () => Effect.gen(function* () {
  const urls: string[] = []
  const fetcher: typeof fetch = (input) => {
    urls.push(String(input))
    const cursor = new URL(String(input), "https://test.local").searchParams.get("cursor")
    return Promise.resolve(Response.json(cursor == null ? {
      national: [{ date: "2017-03-27", price: 10000 }], selected: [], nextCursor: "2017-03-27",
    } : {
      national: [{ date: "2017-03-28", price: 11000 }], selected: [{ date: "2017-03-28", price: 12000 }], nextCursor: null,
    }))
  }
  const series = yield* fetchTrend("beras", "31", { from: "2017-03-27", to: "2017-03-28", resolution: "day" }, fetcher)
  assert.deepStrictEqual(series.national, [{ date: "2017-03-27", price: 10000 }, { date: "2017-03-28", price: 11000 }])
  assert.deepStrictEqual(series.selected, [{ date: "2017-03-28", price: 12000 }])
  assert.strictEqual(series.changePct, 10)
  assert.strictEqual(series.direction, "up")
  assert.ok(urls[1]?.includes("cursor=2017-03-27"))
  assert.ok(urls[0]?.startsWith("/api/trend?commodity=beras&region=31&from="))
}))

it.effect("fails visibly on repeated cursors or observations outside the requested window", () => Effect.gen(function* () {
  for (const body of [
    { national: [{ date: "2017-03-27", price: 10000 }], selected: null, nextCursor: "2017-03-27" },
    { national: [{ date: "2016-01-01", price: 10000 }], selected: null, nextCursor: null },
  ]) {
    const result = yield* Effect.either(fetchTrend("beras", null, { from: "2017-03-27", to: "2017-03-28", resolution: "day" }, transport(body)))
    assert.ok(Either.isLeft(result))
  }
}))

it.effect("interrupting a request aborts the underlying fetch", () => Effect.gen(function* () {
  let signal: AbortSignal | null | undefined
  const fetcher: typeof fetch = (_url, options) => {
    signal = options?.signal
    return new Promise(() => {})
  }
  const fiber = yield* Effect.fork(fetchSnapshot("2017-03-27", "beras", fetcher))
  yield* Effect.yieldNow()
  yield* Fiber.interrupt(fiber)
  assert.strictEqual(signal?.aborted, true)
}))

it.effect("fails the entire trend when a later page fails instead of exposing a partial chart", () => Effect.gen(function* () {
  const fetcher: typeof fetch = (input) => Promise.resolve(String(input).includes("cursor=")
    ? Response.json({}, { status: 503 })
    : Response.json({ national: [{ date: "2017-03-27", price: 10000 }], selected: null, nextCursor: "2017-03-27" }))
  const error = yield* Effect.flip(fetchTrend("beras", null, { from: "2017-03-27", to: "2017-03-28", resolution: "day" }, fetcher))
  assert.strictEqual(error.kind, "coverage")
}))

it.effect("fails visibly when a server keeps paginating beyond the safety bound", () => Effect.gen(function* () {
  let page = 0
  const fetcher: typeof fetch = () => {
    const date = addIsoDays("2017-03-27", page++)
    return Promise.resolve(Response.json({ national: [{ date, price: 10000 }], selected: null, nextCursor: date }))
  }
  const error = yield* Effect.flip(fetchTrend("beras", null, { from: "2017-03-27", to: "2018-03-27", resolution: "day" }, fetcher))
  assert.strictEqual(error.kind, "request")
  assert.ok(error.message.includes("safety bound"))
}))

it.effect("the client speaks the actual Worker HTTP contract over the SQLite read store", () => Effect.gen(function* () {
  const db = yield* sqliteFixture
  yield* db.price("2017-03-27", "31", 10000)
  yield* db.price("2017-03-28", "31", 12000)
  const fetcher: typeof fetch = (input) => Effect.runPromise(
    handlePriceRequest(new Request(new URL(String(input), "https://test.local"))).pipe(
      Effect.provide(priceReadStoreLayer(db.db)),
      Effect.map((response) => response!),
    ),
  )
  const snapshot = yield* fetchSnapshot("2017-03-27", "beras", fetcher)
  assert.strictEqual(snapshot.nationalAvg, 10000)
  const series = yield* fetchTrend("beras", "31", { from: "2017-03-27", to: "2017-03-28", resolution: "day" }, fetcher)
  assert.deepStrictEqual(series.selected, [{ date: "2017-03-27", price: 10000 }, { date: "2017-03-28", price: 12000 }])
}))
