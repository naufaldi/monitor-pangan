import { useEffect, useReducer, useState } from "react"
import { Effect } from "effect"
import type { PriceFetchError } from "./api-client.ts"

export type PriceRequest<A> =
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; data: A }
  | { status: "error"; key: string; kind: "request" | "coverage" }

type PriceAction<A> =
  | { type: "start"; key: string }
  | { type: "success"; key: string; data: A }
  | { type: "failure"; key: string; kind: "request" | "coverage" }

export function priceRequestReducer<A>(state: PriceRequest<A>, action: PriceAction<A>): PriceRequest<A> {
  if (action.type === "start") return { status: "loading", key: action.key }
  if (state.status !== "loading" || state.key !== action.key) return state
  return action.type === "success"
    ? { status: "ready", key: action.key, data: action.data }
    : { status: "error", key: action.key, kind: action.kind }
}

/** A canceled attempt may settle, but it no longer owns any UI transitions. */
export function runPriceRequest<A>(
  key: string,
  load: () => Effect.Effect<A, PriceFetchError>,
  signal: AbortSignal,
  dispatch: (action: PriceAction<A>) => void,
): Promise<void> {
  dispatch({ type: "start", key })
  return Effect.runPromise(Effect.suspend(load).pipe(Effect.match({
    onFailure: (error) => {
      if (!signal.aborted) dispatch({ type: "failure", key, kind: error.kind })
    },
    onSuccess: (data) => {
      if (!signal.aborted) dispatch({ type: "success", key, data })
    },
  })), { signal }).catch(() => {
    if (!signal.aborted) dispatch({ type: "failure", key, kind: "request" })
  })
}

/** The effect instance owns its lifetime, including retries for the same key. */
export function usePriceRequest<A>(key: string, cached: A | null, load: () => Effect.Effect<A, PriceFetchError>) {
  const [attempt, retry] = useReducer((n: number) => n + 1, 0)
  const [state, setState] = useState<PriceRequest<A>>({ status: "loading", key })
  useEffect(() => {
    const controller = new AbortController()
    if (cached != null) return
    void runPriceRequest(key, load, controller.signal, (action) => setState((current) => priceRequestReducer(current, action)))
    return () => controller.abort()
  }, [key, cached, load, attempt])
  const request: PriceRequest<A> = cached != null
    ? { status: "ready", key, data: cached }
    : state.key === key ? state : { status: "loading", key }
  return { request, retry }
}
