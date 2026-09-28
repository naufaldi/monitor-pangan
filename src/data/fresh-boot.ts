import { Data, Effect, Schema } from "effect"
import { applyFreshPrices, STATIC_LIVE_THROUGH } from "./fresh-prices.ts"
import { FreshPayloadSchema } from "./fresh-payload.ts"

class FreshFetchError extends Data.TaggedError("FreshFetchError")<{
  readonly message: string
}> {}

/** Read the payload the worker embedded in the HTML shell. */
export function bootFreshPricesFromDocument(): void {
  if (typeof document === "undefined") return
  const text = document.getElementById("mp-pihps-fresh")?.textContent ?? ""
  if (text.trim() === "") return
  const decoded = Schema.decodeUnknownEither(Schema.parseJson(FreshPayloadSchema))(text)
  if (decoded._tag === "Right") applyFreshPrices(decoded.right)
}

/** Ask the worker for PIHPS rows newer than the baked snapshot. */
export const refreshFreshPrices = Effect.fn("FreshPrices.refresh")(function* () {
  const url = `/api/pihps/fresh?after=${STATIC_LIVE_THROUGH}`
  const json: unknown = yield* Effect.tryPromise({
    try: () =>
      fetch(url, { headers: { accept: "application/json" }, cache: "no-store" }).then((res) => {
        if (!res.ok) return Promise.reject(new Error(`HTTP ${res.status}`))
        return res.json()
      }),
    catch: (cause) => new FreshFetchError({ message: String(cause) }),
  })
  const payload = yield* Schema.decodeUnknown(FreshPayloadSchema)(json).pipe(
    Effect.mapError((error) => new FreshFetchError({ message: String(error) })),
  )
  applyFreshPrices(payload)
  return payload
})

bootFreshPricesFromDocument()
