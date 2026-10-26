import { assert, it } from "@effect/vitest"
import { Effect, Fiber, TestClock } from "effect"
import { parseReceiptCredentials, receiptLink } from "./receipt.ts"
import { fetchReceiptStatus } from "./receipt-client.ts"
import { postReport } from "./laporan-client.ts"
import type { SubmitBody } from "./laporan.ts"
import { defaultParseSearch } from "@tanstack/react-router"

const id = "d11db382-4e67-4e33-a972-090f987874d8"
const token = "a".repeat(64)
const credentials = { id, token }
const transport = (body: unknown, status = 200): typeof fetch => () => Promise.resolve(Response.json(body, { status }))

it.effect("receipt links reload with the capability in the fragment and only the id in the server URL", () => Effect.sync(() => {
  const url = new URL(receiptLink(id, token), "https://example.test")
  assert.strictEqual(url.searchParams.get("id"), id)
  assert.ok(!url.search.includes(token))
  assert.deepStrictEqual(parseReceiptCredentials(url.searchParams.get("id"), url.hash), credentials)
  assert.strictEqual(parseReceiptCredentials(id, ""), null)
  assert.strictEqual(parseReceiptCredentials("invalid", url.hash), null)
  assert.strictEqual(parseReceiptCredentials(id, "#receipt=bad"), null)
}))

it.effect("receipt consumption revalidates raw router search values before URL or API use", () => Effect.sync(() => {
  for (const raw of ["31", "null", "true", '{"unexpected":"value"}', '["unexpected"]']) {
    const search = defaultParseSearch(`?id=${encodeURIComponent(raw)}`)
    assert.strictEqual(parseReceiptCredentials(search.id, `#receipt=${token}`), null)
  }
  assert.deepStrictEqual(parseReceiptCredentials(defaultParseSearch(`?id=${id}`).id, `#receipt=${token}`), credentials)
}))

it.effect("status reads send the capability only in a protected header and strip extra response fields", () => Effect.gen(function* () {
  let requests = 0
  const status = yield* fetchReceiptStatus(credentials, (input, init) => {
    requests++
    assert.strictEqual(String(input), `/api/laporan/status?id=${id}`)
    assert.ok(!String(input).includes(token))
    assert.strictEqual(new Headers(init?.headers).get("x-report-receipt"), token)
    assert.strictEqual(init?.cache, "no-store")
    assert.strictEqual(init?.referrerPolicy, "no-referrer")
    assert.strictEqual(init?.redirect, "error")
    return Promise.resolve(Response.json({ status: "reviewed", alias: "private", reviewNote: "private" }))
  })
  assert.deepStrictEqual(status, { status: "reviewed" })
  assert.strictEqual(requests, 1)
}))

it.effect("status failures distinguish invalid links from temporary service and schema failures", () => Effect.gen(function* () {
  for (const [fetcher, kind] of [
    [transport({}, 404), "denied"], [transport({}, 503), "unavailable"],
    [transport({ status: "invented" }), "unavailable"], [(() => Promise.reject(new Error(`offline ${token}`))) as typeof fetch, "unavailable"],
  ] as const) {
    const error = yield* Effect.flip(fetchReceiptStatus(credentials, fetcher))
    assert.strictEqual(error.kind, kind)
    assert.ok(!JSON.stringify(error).includes(token))
  }
}))

it.effect("private status requests stop after five seconds and do not poll", () => Effect.gen(function* () {
  let requests = 0
  let signal: AbortSignal | null | undefined
  const fiber = yield* Effect.fork(fetchReceiptStatus(credentials, (_input, init) => {
    requests++; signal = init?.signal; return new Promise(() => {})
  }).pipe(Effect.either))
  yield* Effect.yieldNow()
  yield* TestClock.adjust("6 seconds")
  assert.strictEqual((yield* Fiber.join(fiber))._tag, "Left")
  assert.strictEqual(signal?.aborted, true)
  assert.strictEqual(requests, 1)
}))

it.effect("report submission decodes new receipts and older responses without a receipt", () => Effect.gen(function* () {
  const body: SubmitBody = { id, commodityId: "beras", outlet: "pasar", price: 16000, placeCode: "3273", alias: null, photo: false, turnstileToken: "test-only" }
  for (const receiptToken of [token, null, undefined]) {
    const response = yield* postReport(body, transport({ id, uploadUrl: null, ...(receiptToken === undefined ? {} : { receiptToken }) }))
    assert.strictEqual(response.id, id)
    assert.strictEqual(response.receiptToken, receiptToken ?? null)
  }
  assert.strictEqual((yield* Effect.flip(postReport(body, transport({ id, receiptToken: "invalid" })))).status, 200)
}))
