import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { parseCommoditySearch } from "./commodity-search.ts"

it.effect("keeps a known komoditas search param and drops unknown ids", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(parseCommoditySearch({ komoditas: "cabai-merah" }), {
      komoditas: "cabai-merah",
    })
    assert.deepStrictEqual(parseCommoditySearch({ komoditas: "nope" }), {})
    assert.deepStrictEqual(parseCommoditySearch({}), {})
  }),
)
