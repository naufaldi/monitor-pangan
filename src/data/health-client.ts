import { Data, Effect, Schema } from "effect"
import { PihpsHealthSchema } from "./health-schema.ts"

export class HealthFetchError extends Data.TaggedError("HealthFetchError")<{}> {}

/** Only official-price routes start optional pipeline reads. */
export function isOfficialPricePath(pathname: string): boolean {
  return /^\/$|^\/(tren|daya-beli|provinsi)\/?$|^\/provinsi\/[^/]+\/?$/.test(pathname)
}

/** A 503 can carry useful degraded/unavailable evidence; validate before interpreting it. */
export const fetchPihpsHealth = Effect.fn("Pihps.healthClient")(function* (fetcher: typeof fetch = fetch) {
  const response = yield* Effect.tryPromise({
    try: (signal) => fetcher("/api/pihps/health", { signal, cache: "no-store", headers: { accept: "application/json" } }),
    catch: () => new HealthFetchError(),
  })
  if (response.status !== 200 && response.status !== 503) return yield* Effect.fail(new HealthFetchError())
  const raw = yield* Effect.tryPromise({ try: () => response.json() as Promise<unknown>, catch: () => new HealthFetchError() })
  const data = yield* Schema.decodeUnknown(PihpsHealthSchema)(raw).pipe(Effect.mapError(() => new HealthFetchError()))
  if (response.status === 503 && data.status !== "degraded" && data.status !== "unavailable") return yield* Effect.fail(new HealthFetchError())
  return data
}, (effect) => effect.pipe(Effect.timeout("5 seconds"), Effect.mapError(() => new HealthFetchError())))
