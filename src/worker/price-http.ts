import { Effect, Schema } from "effect"
import { CanonicalSnapshotSchema, SnapshotQuerySchema, TrendPageQuerySchema, TrendPageSchema } from "../data/price-schema.ts"
import { PriceReadError, PriceReadStore } from "./price-store.ts"

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })
const invalid = () => json({ error: "invalid" }, 400)

/** Price API paths own their errors; unrelated paths continue through the Worker. */
export const handlePriceRequest = Effect.fn("PriceHTTP.handle")(function* (request: Request) {
  const url = new URL(request.url)
  if (url.pathname !== "/api/snapshot" && url.pathname !== "/api/trend") return null
  if (request.method !== "GET") return json({ error: "method" }, 405)
  const params = url.searchParams
  if ([...params.keys()].some((key) => params.getAll(key).length > 1)) return invalid()

  const response = url.pathname === "/api/snapshot"
    ? Effect.gen(function* () {
      const query = yield* Schema.decodeUnknown(SnapshotQuerySchema)({ date: params.get("date"), commodityId: params.get("commodity") })
      const store = yield* PriceReadStore
      const snapshot = yield* store.snapshot(query.date, query.commodityId)
      const output = yield* Schema.decodeUnknown(CanonicalSnapshotSchema)(snapshot).pipe(Effect.mapError((cause) => new PriceReadError({ message: String(cause) })))
      return json(output)
    })
    : Effect.gen(function* () {
      const limitRaw = params.get("limit")
      if (limitRaw != null && !/^\d+$/.test(limitRaw)) return invalid()
      const query = yield* Schema.decodeUnknown(TrendPageQuerySchema)({
        commodityId: params.get("commodity"),
        regionCode: params.get("region") ?? undefined,
        from: params.get("from"), to: params.get("to"), cursor: params.get("cursor") ?? undefined,
        limit: limitRaw == null ? 500 : Number(limitRaw),
      })
      const store = yield* PriceReadStore
      const page = yield* store.trendPage(query)
      const output = yield* Schema.decodeUnknown(TrendPageSchema)(page).pipe(Effect.mapError((cause) => new PriceReadError({ message: String(cause) })))
      return json(output)
    })
  return yield* response.pipe(Effect.catchAll((error) => Effect.succeed(
    error._tag === "ParseError" ? invalid() : error._tag === "CoverageUnavailable"
      ? json({ error: "coverage_unavailable" }, 503)
      : json({ error: "price_read_failed" }, 500),
  )))
})
