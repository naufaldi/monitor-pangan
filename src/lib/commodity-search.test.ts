import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { parseCommoditySearch, parseHomeSearch, homeSelectedDate } from "./commodity-search.ts"

it.effect("keeps a known komoditas search param and drops unknown ids", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(parseCommoditySearch({ komoditas: "cabai-merah" }), {
      komoditas: "cabai-merah",
    })
    assert.deepStrictEqual(parseCommoditySearch({ komoditas: "nope" }), {})
    assert.deepStrictEqual(parseCommoditySearch({}), {})
  }),
)

it.effect("home accepts only real selectable dates and leaves other routes commodity-only", () => Effect.sync(() => {
  const dates = ["2017-03-27", "2026-09-16"]
  assert.deepStrictEqual(parseHomeSearch({ komoditas: "beras", tanggal: "2017-03-27" }, dates), { komoditas: "beras", tanggal: "2017-03-27" })
  for (const tanggal of ["2017-02-30", "2017-03-28", 42]) {
    assert.deepStrictEqual(parseHomeSearch({ tanggal }, dates), {})
  }
  assert.deepStrictEqual(parseCommoditySearch({ tanggal: "2017-03-27" }), {})
}))

it.effect("an explicit historical URL remains pinned while absent tanggal follows freshness", () => Effect.sync(() => {
  const dates = ["2017-03-27", "2026-09-16", "2026-09-28"]
  assert.strictEqual(homeSelectedDate({ tanggal: "2017-03-27" }, dates, "2026-09-28"), "2017-03-27")
  assert.strictEqual(homeSelectedDate({}, dates, "2026-09-28"), "2026-09-28")
}))
