import { Data, Effect, Schema } from "effect"
import { ReceiptStatusSchema } from "./laporan.ts"
import type { ReceiptCredentials } from "./receipt.ts"

export class ReceiptClientError extends Data.TaggedError("ReceiptClientError")<{
  readonly kind: "denied" | "unavailable"
}> {}

/** Capability travels only in a header, never a URL or logged error. No polling. */
export const fetchReceiptStatus = Effect.fn("Receipt.status")(function* (
  credentials: ReceiptCredentials, fetcher: typeof fetch = fetch,
) {
  const unavailable = () => new ReceiptClientError({ kind: "unavailable" })
  const response = yield* Effect.tryPromise({
    try: (signal) => fetcher(`/api/laporan/status?id=${encodeURIComponent(credentials.id)}`, {
      signal, cache: "no-store", referrerPolicy: "no-referrer", redirect: "error",
      headers: { "x-report-receipt": credentials.token, accept: "application/json" },
    }),
    catch: unavailable,
  })
  if (response.status === 404) return yield* Effect.fail(new ReceiptClientError({ kind: "denied" }))
  if (!response.ok) return yield* Effect.fail(unavailable())
  const raw = yield* Effect.tryPromise({ try: () => response.json() as Promise<unknown>, catch: unavailable })
  return yield* Schema.decodeUnknown(ReceiptStatusSchema)(raw).pipe(Effect.mapError(unavailable))
}, (effect) => effect.pipe(Effect.timeout("5 seconds"), Effect.mapError((error) =>
  error instanceof ReceiptClientError ? error : new ReceiptClientError({ kind: "unavailable" }))))
