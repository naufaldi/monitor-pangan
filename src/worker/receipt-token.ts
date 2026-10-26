import { Data, Effect } from "effect"

export class ReceiptCryptoError extends Data.TaggedError("ReceiptCryptoError")<{}> {}

/** 256 random bits; the raw capability is returned once and never persisted. */
export const newReceiptToken = Effect.try({
  try: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
  catch: () => new ReceiptCryptoError(),
})

export const hashReceiptToken = (token: string) => Effect.tryPromise({
  try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((buffer) =>
    Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")),
  catch: () => new ReceiptCryptoError(),
})

/** Compare fixed-length hashes without returning a prefix-dependent result. */
export function receiptHashMatches(actual: string, stored: string | null): boolean {
  const expected = stored ?? "0".repeat(64)
  let difference = actual.length ^ expected.length
  for (let index = 0; index < 64; index++) difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0)
  return stored != null && difference === 0
}
