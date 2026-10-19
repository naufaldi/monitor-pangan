import { assert, it } from "@effect/vitest"
import { Deferred, Effect } from "effect"
import { priceRequestReducer, runPriceRequest, type PriceRequest } from "./price-request.ts"
import { PriceFetchError } from "./api-client.ts"

it.effect("only the current loading key can accept a result in either arrival order", () => Effect.sync(() => {
  const initial: PriceRequest<number> = { status: "loading", key: "A" }
  const loadingB = priceRequestReducer(initial, { type: "start", key: "B" })
  for (const stale of [
    { type: "success", key: "A", data: 100 } as const,
    { type: "failure", key: "A", kind: "request" } as const,
  ]) {
    assert.deepStrictEqual(priceRequestReducer(loadingB, stale), loadingB)
    const readyB = priceRequestReducer(loadingB, { type: "success", key: "B", data: 200 })
    assert.deepStrictEqual(priceRequestReducer(readyB, stale), { status: "ready", key: "B", data: 200 })
  }
}))

it.effect("retry clears an error and can accept a successful response for the same selection", () => Effect.sync(() => {
  const failed: PriceRequest<number> = { status: "error", key: "A", kind: "coverage" }
  const retry = priceRequestReducer(failed, { type: "start", key: "A" })
  assert.deepStrictEqual(retry, { status: "loading", key: "A" })
  assert.deepStrictEqual(priceRequestReducer(retry, { type: "success", key: "A", data: 42 }), {
    status: "ready", key: "A", data: 42,
  })
}))

it.effect("a stale success cannot overwrite the current failure", () => Effect.sync(() => {
  const failed: PriceRequest<number> = { status: "error", key: "B", kind: "coverage" }
  assert.deepStrictEqual(priceRequestReducer(failed, { type: "success", key: "A", data: 100 }), failed)
}))

for (const staleResult of ["success", "failure"] as const) {
  for (const staleFirst of [true, false]) {
    it.effect(`cancellation rejects stale ${staleResult} ${staleFirst ? "before" : "after"} the new success`, () => Effect.gen(function* () {
      const older = yield* Deferred.make<number, PriceFetchError>()
      const newer = yield* Deferred.make<number, PriceFetchError>()
      let state: PriceRequest<number> = { status: "loading", key: "A" }
      const dispatch = (action: Parameters<typeof priceRequestReducer<number>>[1]) => { state = priceRequestReducer(state, action) }
      const oldController = new AbortController()
      const oldDone = runPriceRequest("A", () => Deferred.await(older), oldController.signal, dispatch)
      oldController.abort()
      const newDone = runPriceRequest("B", () => Deferred.await(newer), new AbortController().signal, dispatch)
      const completeOld = staleResult === "success" ? Deferred.succeed(older, 100)
        : Deferred.fail(older, new PriceFetchError({ kind: "request", message: "offline" }))
      if (staleFirst) yield* completeOld
      yield* Deferred.succeed(newer, 200)
      yield* Effect.promise(() => newDone)
      if (!staleFirst) yield* completeOld
      yield* Effect.promise(() => oldDone)
      assert.deepStrictEqual(state as PriceRequest<number>, { status: "ready", key: "B", data: 200 })
    }))
  }
}

it.effect("rapid same-key retries cannot accept an earlier attempt and unmount emits no result", () => Effect.gen(function* () {
  const old = yield* Deferred.make<number, PriceFetchError>()
  const next = yield* Deferred.make<number, PriceFetchError>()
  let state: PriceRequest<number> = { status: "loading", key: "A" }
  const dispatch = (action: Parameters<typeof priceRequestReducer<number>>[1]) => { state = priceRequestReducer(state, action) }
  const first = new AbortController()
  const firstDone = runPriceRequest("A", () => Deferred.await(old), first.signal, dispatch)
  first.abort()
  const nextDone = runPriceRequest("A", () => Deferred.await(next), new AbortController().signal, dispatch)
  yield* Deferred.succeed(next, 200)
  yield* Effect.promise(() => nextDone)
  yield* Deferred.fail(old, new PriceFetchError({ kind: "request", message: "late error" }))
  yield* Effect.promise(() => firstDone)
  assert.deepStrictEqual(state as PriceRequest<number>, { status: "ready", key: "A", data: 200 })

  const unmounted = yield* Deferred.make<number, PriceFetchError>()
  const controller = new AbortController()
  const done = runPriceRequest("B", () => Deferred.await(unmounted), controller.signal, dispatch)
  controller.abort()
  yield* Deferred.succeed(unmounted, 300)
  yield* Effect.promise(() => done)
  assert.deepStrictEqual(state, { status: "loading", key: "B" })
}))
