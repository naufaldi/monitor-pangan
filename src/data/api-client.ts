import { Data, Effect, Schema } from "effect"
import { trendDirection } from "#/lib/format.ts"
import { COMMODITIES } from "./catalog.ts"
import { CanonicalSnapshotSchema, SnapshotQuerySchema, TrendPageQuerySchema, TrendPageSchema } from "./price-schema.ts"
import type { Snapshot, TrendRange, TrendSeries } from "./provider.ts"

export class PriceFetchError extends Data.TaggedError("PriceFetchError")<{
  readonly kind: "request" | "coverage"
  readonly message: string
}> {}

const requestError = (cause: unknown) => new PriceFetchError({ kind: "request", message: String(cause) })

const getJson = Effect.fn("PriceApi.getJson")(function* (url: string, fetcher: typeof fetch) {
  const response = yield* Effect.tryPromise({
    try: (signal) => fetcher(url, { signal, headers: { accept: "application/json" } }),
    catch: requestError,
  })
  if (!response.ok) return yield* Effect.fail(new PriceFetchError({
    kind: response.status === 503 ? "coverage" : "request",
    message: `HTTP ${response.status}`,
  }))
  return yield* Effect.tryPromise({ try: () => response.json() as Promise<unknown>, catch: requestError })
})

/** Decode external data once; presentation keeps its existing mutable arrays. */
export const fetchSnapshot = Effect.fn("PriceApi.snapshot")(function* (
  date: string,
  commodityId: string,
  fetcher: typeof fetch = fetch,
) {
  const query = yield* Schema.decodeUnknown(SnapshotQuerySchema)({ date, commodityId }).pipe(Effect.mapError(requestError))
  const json = yield* getJson(`/api/snapshot?${new URLSearchParams({ date: query.date, commodity: query.commodityId })}`, fetcher)
  const snapshot = yield* Schema.decodeUnknown(CanonicalSnapshotSchema)(json).pipe(Effect.mapError(requestError))
  if (snapshot.date !== date || snapshot.commodity.id !== commodityId) {
    return yield* Effect.fail(requestError("Snapshot does not match the requested date and commodity"))
  }
  const result: Snapshot = { ...snapshot, commodity: { ...snapshot.commodity }, rows: snapshot.rows.map((row) => ({ ...row })) }
  return result
})

/** Bound bad servers without ever reporting an incomplete chart as successful. */
const MAX_TREND_PAGES = 100

export const fetchTrend = Effect.fn("PriceApi.trend")(function* (
  commodityId: string,
  regionCode: string | null | undefined,
  range: TrendRange,
  fetcher: typeof fetch = fetch,
) {
  const query = yield* Schema.decodeUnknown(TrendPageQuerySchema)({
    commodityId, ...(regionCode ? { regionCode } : {}), from: range.from, to: range.to, limit: 1000,
  }).pipe(Effect.mapError(requestError))
  const national: TrendSeries["national"] = []
  const selected: TrendSeries["selected"] = regionCode ? [] : null
  let cursor: string | undefined
  for (let pageNumber = 0; pageNumber < MAX_TREND_PAGES; pageNumber++) {
    const params = new URLSearchParams({
      commodity: query.commodityId,
      ...(query.regionCode ? { region: query.regionCode } : {}),
      from: query.from, to: query.to, ...(cursor ? { cursor } : {}), limit: String(query.limit),
    })
    const json = yield* getJson(`/api/trend?${params}`, fetcher)
    const page = yield* Schema.decodeUnknown(TrendPageSchema)(json).pipe(Effect.mapError(requestError))
    if ((page.selected == null) !== (selected == null) ||
      page.national.some((point) => point.date < query.from || point.date > query.to || (cursor != null && point.date <= cursor)) ||
      (page.nextCursor != null && cursor != null && page.nextCursor <= cursor)) {
      return yield* Effect.fail(requestError("Trend page does not advance within the requested range"))
    }
    national.push(...page.national.map((point) => ({ ...point })))
    if (selected != null) selected.push(...(page.selected ?? []).map((point) => ({ ...point })))
    if (page.nextCursor == null) {
      const commodity = COMMODITIES.find((item) => item.id === commodityId)!
      const first = national[0]
      const last = national.at(-1)
      const changePct = first == null || last == null ? 0 : ((last.price - first.price) / first.price) * 100
      const series: TrendSeries = { commodity, unit: commodity.unit, national, selected, changePct, direction: trendDirection(changePct), range }
      return series
    }
    cursor = page.nextCursor
  }
  return yield* Effect.fail(requestError("Trend pagination exceeded its safety bound"))
})
