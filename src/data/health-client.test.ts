import { assert, it } from "@effect/vitest"
import { Effect, Fiber, TestClock } from "effect"
import { fetchPihpsHealth, isOfficialPricePath } from "./health-client.ts"
import { refreshFreshPrices } from "./fresh-boot.ts"
import { applyFreshPrices, clearFreshPrices, freshPrice } from "./fresh-prices.ts"

const health = {
  status: "waiting", checkedAt: "2026-10-26T08:00:00.000Z", latestCheckedDate: "2026-10-23",
  latestPricedDate: "2026-10-22", oldestUnresolvedDate: "2026-10-26", lastAttemptAt: "2026-10-26T07:15:00Z",
  lastAttemptOutcome: "complete", lastSuccessfulRunAt: "2026-10-26T07:15:00Z",
}
const transport = (body: unknown, status = 200): typeof fetch => () => Promise.resolve(Response.json(body, { status }))

it.effect("accepts waiting and structured degraded/unavailable health without confusing observation and check dates", () => Effect.gen(function* () {
  for (const status of ["ok", "waiting", "degraded", "unavailable"] as const) {
    const data = yield* fetchPihpsHealth(transport({ ...health, status }, status === "degraded" || status === "unavailable" ? 503 : 200))
    assert.strictEqual(data.status, status)
    assert.strictEqual(data.latestPricedDate, "2026-10-22")
    assert.strictEqual(data.checkedAt, "2026-10-26T08:00:00.000Z")
  }
}))

it.effect("rejects malformed, inconsistent HTTP, and offline health responses", () => Effect.gen(function* () {
  for (const fetcher of [transport({}), transport({ ...health, checkedAt: "today" }), transport(health, 503), transport(health, 500), (() => Promise.reject(new Error("offline"))) as typeof fetch]) {
    const result = yield* Effect.either(fetchPihpsHealth(fetcher))
    assert.strictEqual(result._tag, "Left")
  }
}))

it.effect("caps an unresponsive health request and never retries automatically", () => Effect.gen(function* () {
  let requests = 0
  let signal: AbortSignal | null | undefined
  const fiber = yield* Effect.fork(fetchPihpsHealth((_input, init) => {
    requests++
    signal = init?.signal
    return new Promise(() => {})
  }).pipe(Effect.either))
  yield* Effect.yieldNow()
  yield* TestClock.adjust("6 seconds")
  const result = yield* Fiber.join(fiber)
  assert.strictEqual(result._tag, "Left")
  assert.strictEqual(requests, 1)
  assert.strictEqual(signal?.aborted, true)
}))

it.effect("preserves cached usable prices after failed or empty refreshes", () => Effect.gen(function* () {
  applyFreshPrices({ latestDate: "2026-10-23", dates: ["2026-10-23"], prices: { "2026-10-23:beras:31": 16000 } })
  yield* Effect.either(refreshFreshPrices(transport({}, 503)))
  assert.strictEqual(freshPrice("2026-10-23:beras:31"), 16000)
  yield* refreshFreshPrices(transport({ latestDate: null, dates: [], prices: {} }))
  assert.strictEqual(freshPrice("2026-10-23:beras:31"), 16000)
}).pipe(Effect.ensuring(Effect.sync(clearFreshPrices))))

it.effect("keeps citizen, admin, receipt and unknown paths outside official health reads", () => Effect.sync(() => {
  for (const path of ["/", "/tren", "/daya-beli/", "/provinsi", "/provinsi/", "/provinsi/31"]) assert.strictEqual(isOfficialPricePath(path), true)
  for (const path of ["/lapor", "/laporan", "/laporan-status", "/admin", "/missing"]) assert.strictEqual(isOfficialPricePath(path), false)
}))
