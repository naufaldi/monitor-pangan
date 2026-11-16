import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { bootFreshPricesFromText, takeEmbeddedFreshPayload } from "./fresh-boot.ts"
import { clearFreshPrices, freshPrice } from "./fresh-prices.ts"

it.effect("only a valid embedded payload suppresses the first client refresh, once", () => Effect.sync(() => {
  for (const text of [undefined, null, "", "  ", "{not json", '{"latestDate":1}']) {
    assert.strictEqual(bootFreshPricesFromText(text), false)
    assert.strictEqual(takeEmbeddedFreshPayload(), false)
  }
  assert.strictEqual(bootFreshPricesFromText(JSON.stringify({ latestDate: "2026-10-23", dates: ["2026-10-23"], prices: { "2026-10-23:beras:31": 16000 } })), true)
  assert.strictEqual(freshPrice("2026-10-23:beras:31"), 16000)
  assert.strictEqual(takeEmbeddedFreshPayload(), true)
  // Later automatic loads (navigation from a report page, remounts) and manual retries fetch.
  assert.strictEqual(takeEmbeddedFreshPayload(), false)
  // A valid empty store read is still the worker's answer; repeating it would read the same rows.
  assert.strictEqual(bootFreshPricesFromText(JSON.stringify({ latestDate: null, dates: [], prices: {} })), true)
  assert.strictEqual(takeEmbeddedFreshPayload(), true)
}).pipe(Effect.ensuring(Effect.sync(clearFreshPrices))))
