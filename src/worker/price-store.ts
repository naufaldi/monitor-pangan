import { Context, Data, Effect, Layer, Schema } from "effect"
import { COMMODITIES } from "../data/catalog.ts"
import { REGION_ROWS } from "../data/pihps-catalog.ts"
import {
  CanonicalSnapshotSchema, CivilDateSchema, RegionCodeSchema, SnapshotQuerySchema,
  TrendPageQuerySchema, TrendPageSchema, TrendPointSchema,
  type SnapshotValidated, type TrendPage, type TrendPageQuery,
} from "../data/price-schema.ts"
import { summarizePrices } from "../data/price-summary.ts"
import { isTradingDay, nextIsoDay } from "../lib/civil-date.ts"
import { ensureMigrated, type D1Database } from "./d1-store.ts"

export class PriceReadError extends Data.TaggedError("PriceReadError")<{ readonly message: string }> {}
export class CoverageUnavailable extends Data.TaggedError("CoverageUnavailable")<{ readonly from: string; readonly to: string }> {}
type ReadFailure = PriceReadError | CoverageUnavailable

export class PriceReadStore extends Context.Tag("PriceReadStore")<PriceReadStore, {
  readonly snapshot: (date: string, commodityId: string) => Effect.Effect<SnapshotValidated, ReadFailure>
  readonly trendPage: (query: TrendPageQuery) => Effect.Effect<TrendPage, ReadFailure>
}>() {}

const readError = (cause: unknown) => new PriceReadError({ message: String(cause) })
const Price = Schema.Number.pipe(Schema.finite(), Schema.positive())
const SnapshotRows = Schema.Array(Schema.Struct({ region_code: RegionCodeSchema, price: Schema.NullOr(Price) })).pipe(
  Schema.filter((rows) => new Set(rows.map((row) => row.region_code)).size === rows.length),
)
const NationalRows = Schema.Array(Schema.Struct({
  date: CivilDateSchema,
  price: Price,
  duplicate_count: Schema.Literal(0),
  invalid_count: Schema.Literal(0),
}))
const CoverageRows = Schema.Array(Schema.Struct({ date: CivilDateSchema, status: Schema.Literal("live", "empty", "pending", "error") }))
const regionSql = REGION_ROWS.map(([code]) => `'${code}'`).join(", ")

/** Read only the official retail lane. Recovered observations do not imply a completed survey. */
export const priceReadStoreLayer = (db: D1Database) => {
  const query = (sql: string, values: readonly unknown[]) => ensureMigrated(db).pipe(
    Effect.mapError(readError),
    Effect.andThen(() => Effect.tryPromise({
      try: () => db.prepare(sql).bind(...values).all<unknown>(),
      catch: readError,
    })),
    Effect.flatMap(Schema.decodeUnknown(Schema.Struct({ results: Schema.Array(Schema.Unknown) }))),
    Effect.mapError(readError),
    Effect.map((result) => result.results),
  )

  const requireCoverage = (from: string, to: string, weekdaysOnly: boolean) => Effect.gen(function* () {
    if (from > to) return
    const rows = yield* query("SELECT date, status FROM source_days WHERE source_id = 'pihps' AND date >= ? AND date <= ? ORDER BY date", [from, to]).pipe(
      Effect.flatMap(Schema.decodeUnknown(CoverageRows)), Effect.mapError(readError),
    )
    const trusted = new Set(rows.filter((row) => row.status === "live" || row.status === "empty").map((row) => row.date))
    for (let date = from; date <= to; date = nextIsoDay(date)) {
      if ((!weekdaysOnly || isTradingDay(date)) && !trusted.has(date)) {
        return yield* Effect.fail(new CoverageUnavailable({ from, to }))
      }
      if (date === to) break
    }
  })

  const snapshot = Effect.fn("PriceReadStore.snapshot")(function* (date: string, commodityId: string) {
    yield* Schema.decodeUnknown(SnapshotQuerySchema)({ date, commodityId }).pipe(Effect.mapError(readError))
    const observed = yield* query("SELECT region_code, price FROM prices_daily WHERE date = ? AND commodity_id = ? AND source_id = 'pihps' AND level = 'eceran' ORDER BY region_code", [date, commodityId]).pipe(
      Effect.flatMap(Schema.decodeUnknown(SnapshotRows)), Effect.mapError(readError),
    )
    if (!observed.some((row) => row.price != null)) yield* requireCoverage(date, date, false)
    const byRegion = new Map(observed.map((row) => [row.region_code, row.price]))
    const rows = REGION_ROWS.map(([regionCode]) => ({ regionCode, price: byRegion.get(regionCode) ?? null }))
    return yield* Schema.decodeUnknown(CanonicalSnapshotSchema)({ date, commodity: COMMODITIES.find((commodity) => commodity.id === commodityId), rows, ...summarizePrices(rows) }).pipe(Effect.mapError(readError))
  })

  const trendPage = Effect.fn("PriceReadStore.trendPage")(function* (input: TrendPageQuery) {
    const request = yield* Schema.decodeUnknown(TrendPageQuerySchema)(input).pipe(Effect.mapError(readError))
    const { commodityId, regionCode, from, to, cursor, limit } = request
    const cursorSql = cursor == null ? "" : " AND date > ?"
    const windowParams = cursor == null ? [commodityId, from, to] : [commodityId, from, to, cursor]
    // The lookahead belongs only to national dates; sparse provinces never set page boundaries.
    const nationalRows = yield* query(`SELECT date, AVG(price) AS price,
      COUNT(*) - COUNT(DISTINCT region_code) AS duplicate_count,
      SUM(CASE WHEN region_code NOT IN (${regionSql}) OR (price IS NOT NULL AND (typeof(price) NOT IN ('integer', 'real') OR price <= 0)) THEN 1 ELSE 0 END) AS invalid_count
      FROM prices_daily WHERE commodity_id = ? AND source_id = 'pihps' AND level = 'eceran'
      AND date >= ? AND date <= ?${cursorSql}
      GROUP BY date HAVING AVG(price) IS NOT NULL OR invalid_count > 0 OR duplicate_count > 0 ORDER BY date LIMIT ?`, [...windowParams, limit + 1]).pipe(
      Effect.flatMap(Schema.decodeUnknown(NationalRows)), Effect.mapError(readError),
    )
    const national = nationalRows.slice(0, limit).map((row) => ({ date: row.date, price: summarizePrices([{ regionCode: "national", price: row.price }]).nationalAvg! }))
    const pageEnd = national.at(-1)?.date
    if (pageEnd == null) {
      if (cursor !== to) yield* requireCoverage(cursor == null ? from : nextIsoDay(cursor), to, true)
      return { national: [], selected: regionCode == null ? null : [], nextCursor: null }
    }
    const selected = regionCode == null ? null : yield* query(`SELECT date, price FROM prices_daily
      WHERE commodity_id = ? AND source_id = 'pihps' AND level = 'eceran'
      AND date >= ? AND date <= ?${cursorSql} AND region_code = ? AND price IS NOT NULL ORDER BY date`,
      [...(cursor == null ? [commodityId, from, pageEnd] : [commodityId, from, pageEnd, cursor]), regionCode]).pipe(
      Effect.flatMap(Schema.decodeUnknown(Schema.Array(TrendPointSchema))), Effect.mapError(readError),
    )
    return yield* Schema.decodeUnknown(TrendPageSchema)({ national, selected, nextCursor: nationalRows.length > limit ? pageEnd : null }).pipe(Effect.mapError(readError))
  })
  return Layer.succeed(PriceReadStore, { snapshot, trendPage })
}
