import { Data, Effect } from "effect"
import { TreeFormatter, type ParseError } from "effect/ParseResult"
import { COMMODITIES } from "./catalog.ts"
import { trendDirection } from "#/lib/format.ts"
import type {
  AsyncPriceDataProvider,
  TrendPoint,
  TrendSeries,
} from "./provider.ts"
import {
  decodeApiTrendResponse,
  decodeSnapshot,
} from "./price-schema.ts"

export class ApiClientError extends Data.TaggedError("ApiClientError")<{
  readonly detail: string
}> {}

const getJson = (url: string) =>
  Effect.tryPromise({
    try: () =>
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
        return res.json() as Promise<unknown>
      }),
    catch: (error) => new ApiClientError({ detail: String(error) }),
  })

const decodeJson = <A>(decoded: Effect.Effect<A, ParseError>) =>
  decoded.pipe(
    Effect.mapError((issue) => new ApiClientError({ detail: TreeFormatter.formatErrorSync(issue) })),
  )

/** One date slice from `GET /api/snapshot`, validated at the boundary. */
export const fetchSnapshot = Effect.fn("ApiClient.fetchSnapshot")(function*(
  date: string,
  commodityId: string,
) {
  const json = yield* getJson(
    `/api/snapshot?date=${encodeURIComponent(date)}&commodity=${encodeURIComponent(commodityId)}`,
  )
  return yield* decodeJson(decodeSnapshot(json))
})

const MAX_TREND_PAGES = 10
const TREND_PAGE_LIMIT = 2000

/** Full day-resolution series from `GET /api/trend`, following cursors. */
export const fetchTrend = Effect.fn("ApiClient.fetchTrend")(function*(
  commodityId: string,
  regionCode: string | null,
  range: { from: string; to: string },
) {
  const commodity = COMMODITIES.find((c) => c.id === commodityId)
  if (commodity === undefined) {
    return yield* new ApiClientError({ detail: `unknown commodity ${commodityId}` })
  }
  const national: TrendPoint[] = []
  const selectedPoints: TrendPoint[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_TREND_PAGES; page++) {
    const params = new URLSearchParams({
      commodity: commodityId,
      from: range.from,
      to: range.to,
      limit: String(TREND_PAGE_LIMIT),
    })
    if (regionCode != null && regionCode !== "") params.set("region", regionCode)
    if (cursor != null) params.set("cursor", cursor)
    const json = yield* getJson(`/api/trend?${params.toString()}`)
    const decoded = yield* decodeJson(decodeApiTrendResponse(json))
    national.push(...decoded.national)
    if (decoded.selected != null) selectedPoints.push(...decoded.selected)
    cursor = decoded.nextCursor
    if (cursor == null) break
  }
  const first = national[0]
  const last = national[national.length - 1]
  const changePct =
    first == null || last == null || first.price === 0
      ? 0
      : ((last.price - first.price) / first.price) * 100
  return {
    commodity,
    unit: commodity.unit,
    national,
    selected: regionCode != null && regionCode !== "" ? selectedPoints : null,
    changePct,
    direction: trendDirection(changePct),
    range: { ...range, resolution: "day" as const },
  } satisfies TrendSeries
})

/** D1-backed provider. The sync bundle provider stays as offline fallback. */
export const apiProvider: AsyncPriceDataProvider = {
  snapshot: (date, commodityId) => Effect.runPromise(fetchSnapshot(date, commodityId)),
  trend: (commodityId, regionCode, range) =>
    Effect.runPromise(fetchTrend(commodityId, regionCode ?? null, range)),
}
