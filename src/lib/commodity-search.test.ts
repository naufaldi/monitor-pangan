import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { parseCommoditySearch, parsePageSearch } from "./commodity-search.ts"

it.effect("keeps a known komoditas search param and drops unknown ids", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(parseCommoditySearch({ komoditas: "cabai-merah" }), {
      komoditas: "cabai-merah",
    })
    assert.deepStrictEqual(parseCommoditySearch({ komoditas: "nope" }), {})
    assert.deepStrictEqual(parseCommoditySearch({}), {})
  }),
)

it.effect("page search keeps a well-formed tanggal and drops malformed dates", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(
      parsePageSearch({ komoditas: "beras", tanggal: "2025-10-30" }),
      { komoditas: "beras", tanggal: "2025-10-30" },
    )
    assert.deepStrictEqual(parsePageSearch({ tanggal: "30/10/2025" }), {})
    assert.deepStrictEqual(parsePageSearch({ tanggal: 20251030 }), {})
  }),
)
