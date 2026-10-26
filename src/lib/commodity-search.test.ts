import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { createMemoryHistory, defaultParseSearch, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { parseCommoditySearch, parseHomeSearch, homeSelectedDate, parseTrendSearch, parseProvinceSearch, parseOverviewSearch } from "./commodity-search.ts"

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

it.effect("trend restores supported filters and strips home-only date state", () => Effect.sync(() => {
  const context = { komoditas: "cabai-merah", provinsi: "31", rentang: "7d", tanggal: "2026-09-16" }
  assert.deepStrictEqual(parseTrendSearch(context), { komoditas: "cabai-merah", provinsi: "31", rentang: "7d" })
  assert.deepStrictEqual(parseProvinceSearch(context), { komoditas: "cabai-merah", provinsi: "31" })
  assert.deepStrictEqual(parseCommoditySearch(context), { komoditas: "cabai-merah" })
  for (const rentang of ["month", ["1y"], 7, {}, null]) {
    assert.deepStrictEqual(parseTrendSearch({ provinsi: "31", rentang }), { provinsi: "31" })
  }
  for (const rentang of ["7d", "1m", "1y", "all"] as const) {
    assert.deepStrictEqual(parseTrendSearch({ rentang }), { rentang })
  }
  assert.deepStrictEqual(parseOverviewSearch({ provinsi: "bad", tanggal: "2026-09-16" }), { provinsi: "31" })
  assert.deepStrictEqual(parseOverviewSearch({ provinsi: "95" }), { provinsi: "95" })
}))

it.effect("commodity transitions preserve geography and leave history entries independently restorable", () => Effect.sync(() => {
  const before = parseTrendSearch({ komoditas: "beras", provinsi: "95", rentang: "1y" })
  const after = parseTrendSearch({ ...before, komoditas: "cabai-merah" })
  assert.deepStrictEqual(before, { komoditas: "beras", provinsi: "95", rentang: "1y" })
  assert.deepStrictEqual(after, { komoditas: "cabai-merah", provinsi: "95", rentang: "1y" })
  const restored = parseTrendSearch(Object.fromEntries(new URLSearchParams(new URLSearchParams(before).toString())))
  assert.deepStrictEqual(restored, before)
  assert.deepStrictEqual(parseTrendSearch(Object.fromEntries(new URLSearchParams(new URLSearchParams(after).toString()))), after)
}))

it.effect("back and forward restore validated filters from independent URL entries", () => Effect.sync(() => {
  const history = createMemoryHistory({ initialEntries: ["/tren?komoditas=beras&provinsi=31&rentang=7d"] })
  const readSelection = () => parseTrendSearch(Object.fromEntries(new URLSearchParams(history.location.search)))
  const initial = readSelection()
  history.push("/tren?komoditas=cabai-merah&provinsi=95&rentang=1y")
  assert.deepStrictEqual(readSelection(), { komoditas: "cabai-merah", provinsi: "95", rentang: "1y" })
  history.back()
  assert.deepStrictEqual(readSelection(), initial)
  history.forward()
  assert.deepStrictEqual(readSelection(), { komoditas: "cabai-merah", provinsi: "95", rentang: "1y" })
  history.destroy()
}))

it.effect("an explicit historical URL remains pinned while absent tanggal follows freshness", () => Effect.sync(() => {
  const dates = ["2017-03-27", "2026-09-16", "2026-09-28"]
  assert.strictEqual(homeSelectedDate({ tanggal: "2017-03-27" }, dates, "2026-09-28"), "2017-03-27")
  assert.strictEqual(homeSelectedDate({}, dates, "2026-09-28"), "2026-09-28")
}))

it.effect("home retains a valid province even when it has no surveyed prices", () => Effect.sync(() => {
  assert.deepStrictEqual(parseHomeSearch({ komoditas: "beras", provinsi: "95" }, []), {
    komoditas: "beras", provinsi: "95",
  })
  for (const provinsi of ["unknown", 999, ["31"], {}, null]) {
    assert.deepStrictEqual(parseHomeSearch({ provinsi }, []), {})
  }
}))

it.effect("normalizes real router numeric province query values before reading them", () => Effect.sync(() => {
  const raw: Record<string, unknown> = defaultParseSearch("?komoditas=beras&provinsi=31&rentang=7d")
  assert.strictEqual(raw.provinsi, 31)
  assert.deepStrictEqual(parseHomeSearch(raw, []), { komoditas: "beras", provinsi: "31" })
  assert.deepStrictEqual(parseTrendSearch(raw), { komoditas: "beras", provinsi: "31", rentang: "7d" })
  assert.deepStrictEqual(parseOverviewSearch(raw), { komoditas: "beras", provinsi: "31" })
}))

it.effect("actual router boundary safely consumes numeric, invalid and object province search on all routes", () => Effect.sync(() => {
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: "/", validateSearch: (raw: Record<string, unknown>) => parseHomeSearch(raw, []) })
  const trend = createRoute({ getParentRoute: () => root, path: "/tren", validateSearch: parseTrendSearch })
  const overview = createRoute({ getParentRoute: () => root, path: "/provinsi", validateSearch: parseOverviewSearch })
  const routeTree = root.addChildren([home, trend, overview])
  for (const path of ["/", "/tren", "/provinsi"]) {
    for (const [query, expected] of [["31", "31"], ["999", undefined], ["%7B%22code%22%3A31%7D", undefined]] as const) {
      const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [`${path}?komoditas=beras&provinsi=${query}`] }) })
      const raw = router.matchRoutes(router.state.location).at(-1)!.search
      const consumed = path === "/" ? parseHomeSearch(raw, []) : path === "/tren" ? parseTrendSearch(raw) : parseOverviewSearch(raw)
      assert.strictEqual(consumed.provinsi, expected ?? (path === "/provinsi" ? "31" : undefined))
      assert.strictEqual(consumed.komoditas, "beras")
      router.history.destroy()
    }
  }
}))
