import { env } from "cloudflare:workers"
import type { D1Database } from "@cloudflare/workers-types"
import { Data, Effect } from "effect"

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly detail: string
}> {}

/** D1 binding from the worker environment. Server routes only. */
export const getDb = (): D1Database => (env as unknown as { DB: D1Database }).DB

/** Match the provider's Rp 50 rounding so API and bundle agree. */
export const round50 = (value: number): number => Math.round(value / 50) * 50

export type SnapshotRow = {
  regionCode: string
  price: number | null
}

export type TrendRow = {
  date: string
  price: number
}

/** Full 38-province grid for one date and commodity, nulls included. */
export const snapshotRows = Effect.fn("Api.snapshotRows")(function*(
  db: D1Database,
  date: string,
  commodityId: string,
) {
  const result = yield* Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `SELECT g.code AS regionCode, p.price AS price
           FROM regions g
           LEFT JOIN prices_daily p
             ON p.region_code = g.code AND p.date = ?1 AND p.commodity_id = ?2
           ORDER BY g.code`,
        )
        .bind(date, commodityId)
        .all<SnapshotRow>(),
    catch: (error) => new DatabaseError({ detail: String(error) }),
  })
  return result.results ?? []
})

type AvgRow = {
  date: string
  avgPrice: number | null
}

/** Per-date national averages, cursor-paginated over the window. */
export const trendNational = Effect.fn("Api.trendNational")(function*(
  db: D1Database,
  commodityId: string,
  from: string,
  to: string,
  cursor: string | null,
  limit: number,
) {
  const result = yield* Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `SELECT date, AVG(price) AS avgPrice
           FROM prices_daily
           WHERE commodity_id = ?1 AND date >= ?2 AND date <= ?3
             AND (?4 IS NULL OR date > ?4)
           GROUP BY date
           HAVING avgPrice IS NOT NULL
           ORDER BY date ASC
           LIMIT ?5`,
        )
        .bind(commodityId, from, to, cursor, limit)
        .all<AvgRow>(),
    catch: (error) => new DatabaseError({ detail: String(error) }),
  })
  const points: TrendRow[] = []
  for (const row of result.results ?? []) {
    if (row.avgPrice == null) continue
    points.push({ date: row.date, price: round50(row.avgPrice) })
  }
  return points
})

type PriceRow = {
  date: string
  price: number | null
}

/** One province's day prices over the window, nulls skipped. */
export const trendSelected = Effect.fn("Api.trendSelected")(function*(
  db: D1Database,
  commodityId: string,
  regionCode: string,
  from: string,
  to: string,
  cursor: string | null,
  limit: number,
) {
  const result = yield* Effect.tryPromise({
    try: () =>
      db
        .prepare(
          `SELECT date, price
           FROM prices_daily
           WHERE commodity_id = ?1 AND region_code = ?2
             AND date >= ?3 AND date <= ?4
             AND (?5 IS NULL OR date > ?5)
             AND price IS NOT NULL
           ORDER BY date ASC
           LIMIT ?6`,
        )
        .bind(commodityId, regionCode, from, to, cursor, limit)
        .all<PriceRow>(),
    catch: (error) => new DatabaseError({ detail: String(error) }),
  })
  const points: TrendRow[] = []
  for (const row of result.results ?? []) {
    if (row.price == null) continue
    points.push({ date: row.date, price: row.price })
  }
  return points
})
