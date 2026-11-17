import { assert, it } from "@effect/vitest"
import { Effect, Either } from "effect"
import { LaporanClientError, loadWindow, WindowCapacityError, WINDOW_MAX_PAGES } from "./laporan-client.ts"
import type { Outlet, PublicReport } from "./laporan.ts"
import { MAX_PAGE_SIZE } from "#/lib/laporan.ts"

const report = (index: number, outlet: Outlet, commodityId: string): PublicReport => ({
  id: `synthetic-${outlet}-${index}`,
  commodityId,
  outlet,
  price: 12000 + (index % 4) * 500,
  placeCode: "3273",
  seenOn: "2026-11-10",
  alias: null,
  evidence: "receipt",
  hasPhoto: false,
})

/**
 * API-shaped pager with the store's continuation semantics: `nextCursor` is set
 * only while further reviewed rows exist. Offset strings stand in for the
 * server's opaque cursors; payloads decode through the real ReportsPayloadSchema.
 */
const pager = (total: number, options: { failPage?: number } = {}) => {
  const urls: string[] = []
  const fetcher: typeof fetch = (input) => {
    const url = String(input)
    urls.push(url)
    const params = new URL(url, "https://test.local").searchParams
    const outlet = params.get("outlet") as Outlet
    const commodityId = params.get("commodityId") ?? "beras"
    const offset = Number(params.get("cursor") ?? 0)
    if (options.failPage === urls.length) {
      return Promise.resolve(Response.json({ message: "unavailable" }, { status: 503 }))
    }
    const rows = Array.from({ length: Math.min(MAX_PAGE_SIZE, Math.max(0, total - offset)) }, (_, i) =>
      report(offset + i, outlet, commodityId),
    )
    const end = offset + rows.length
    return Promise.resolve(
      Response.json({
        rows,
        nextCursor: end < total ? String(end) : null,
        resumeCursor: rows.length > 0 ? String(end) : null,
      }),
    )
  }
  return { fetcher, urls }
}

const paramsOf = (url: string) => new URL(url, "https://test.local").searchParams

it.effect("a completed window returns every row and stops at the null cursor", () =>
  Effect.gen(function* () {
    const { fetcher, urls } = pager(150)
    const rows = yield* loadWindow("pasar", "beras", fetcher)
    assert.strictEqual(rows.length, 150)
    assert.strictEqual(urls.length, 2)
    const first = paramsOf(urls[0]!)
    assert.strictEqual(first.get("outlet"), "pasar")
    assert.strictEqual(first.get("commodityId"), "beras")
    assert.strictEqual(first.get("window"), "1")
    assert.strictEqual(first.get("limit"), String(MAX_PAGE_SIZE))
    assert.strictEqual(first.get("cursor"), null)
    assert.strictEqual(paramsOf(urls[1]!).get("cursor"), "100")
  }),
)

it.effect("an empty window succeeds with no rows in one request", () =>
  Effect.gen(function* () {
    const { fetcher, urls } = pager(0)
    const rows = yield* loadWindow("ritel", null, fetcher)
    assert.deepStrictEqual(rows, [])
    assert.strictEqual(urls.length, 1)
  }),
)

it.effect("exactly twenty full pages succeed when the final cursor is null", () =>
  Effect.gen(function* () {
    const { fetcher, urls } = pager(WINDOW_MAX_PAGES * MAX_PAGE_SIZE)
    const rows = yield* loadWindow("pasar", null, fetcher)
    assert.strictEqual(rows.length, WINDOW_MAX_PAGES * MAX_PAGE_SIZE)
    assert.strictEqual(urls.length, WINDOW_MAX_PAGES)
    assert.strictEqual(paramsOf(urls[urls.length - 1]!).get("cursor"), "1900")
  }),
)

it.effect("a continuation after page twenty fails with capacity, not truncated success", () =>
  Effect.gen(function* () {
    const { fetcher, urls } = pager(2100)
    const result = yield* Effect.either(loadWindow("pasar", null, fetcher))
    assert.ok(Either.isLeft(result))
    if (Either.isLeft(result)) assert.ok(result.left instanceof WindowCapacityError)
    assert.strictEqual(urls.length, WINDOW_MAX_PAGES)
    assert.strictEqual(paramsOf(urls[urls.length - 1]!).get("cursor"), "1900")
  }),
)

it.effect("a failed page stays a client error, distinct from capacity", () =>
  Effect.gen(function* () {
    const { fetcher, urls } = pager(2100, { failPage: 3 })
    const result = yield* Effect.either(loadWindow("pasar", null, fetcher))
    assert.ok(Either.isLeft(result))
    if (Either.isLeft(result)) {
      const error = result.left
      assert.ok(error instanceof LaporanClientError)
      if (error instanceof LaporanClientError) assert.strictEqual(error.status, 503)
    }
    assert.strictEqual(urls.length, 3)
  }),
)
