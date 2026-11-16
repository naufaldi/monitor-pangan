import { Data, Effect, Schema } from "effect"
import { applyFreshPrices, STATIC_LIVE_THROUGH } from "./fresh-prices.ts"
import { FreshPayloadSchema } from "./fresh-payload.ts"

class FreshFetchError extends Data.TaggedError("FreshFetchError")<{
  readonly message: string
}> {}

let embeddedPending = false

/** Apply an embedded payload. True only when it was present and valid, including a valid empty one. */
export function bootFreshPricesFromText(text: string | null | undefined): boolean {
  const decoded = text == null || text.trim() === "" ? null : Schema.decodeUnknownEither(Schema.parseJson(FreshPayloadSchema))(text)
  if (decoded?._tag === "Right") applyFreshPrices(decoded.right)
  embeddedPending = decoded?._tag === "Right"
  return embeddedPending
}

/** Read the payload the worker embedded in the HTML shell. */
export function bootFreshPricesFromDocument(): void {
  if (typeof document === "undefined") return
  bootFreshPricesFromText(document.getElementById("mp-pihps-fresh")?.textContent)
}

/**
 * The worker embeds the same payload `/api/pihps/fresh` returns, so the first automatic refresh
 * after a valid embed would repeat that read. True once per page load; later and manual refreshes fetch.
 */
export function takeEmbeddedFreshPayload(): boolean {
  const pending = embeddedPending
  embeddedPending = false
  return pending
}

/** Ask the worker for PIHPS rows newer than the baked snapshot. */
export const refreshFreshPrices = Effect.fn("FreshPrices.refresh")(function* (fetcher: typeof fetch = fetch) {
  const url = `/api/pihps/fresh?after=${STATIC_LIVE_THROUGH}`
  const json: unknown = yield* Effect.tryPromise({
    try: (signal) =>
      fetcher(url, { signal, headers: { accept: "application/json" }, cache: "no-store" }).then((res) => {
        if (!res.ok) return Promise.reject(new Error(`HTTP ${res.status}`))
        return res.json()
      }),
    catch: (cause) => new FreshFetchError({ message: String(cause) }),
  })
  const payload = yield* Schema.decodeUnknown(FreshPayloadSchema)(json).pipe(
    Effect.mapError((error) => new FreshFetchError({ message: String(error) })),
  )
  // A successful empty store read must not discard a usable HTML or prior overlay.
  if (payload.dates.length > 0) applyFreshPrices(payload)
  return payload
}, (effect) => effect.pipe(Effect.timeout("5 seconds"), Effect.mapError(() => new FreshFetchError({ message: "Freshness unavailable" }))))

bootFreshPricesFromDocument()
