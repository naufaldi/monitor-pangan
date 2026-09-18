import { Data, Effect, Schema } from "effect"
import { TreeFormatter } from "effect/ParseResult"
import { COMMODITIES, type Commodity } from "#/data/catalog.ts"
import { UnknownCommodityError } from "#/data/price-schema.ts"

const DateString = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/))

const LimitFromString = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
  Schema.lessThanOrEqualTo(2000),
)

const SnapshotQuerySchema = Schema.Struct({
  date: DateString,
  commodity: Schema.NonEmptyString,
})

const TrendQuerySchema = Schema.Struct({
  commodity: Schema.NonEmptyString,
  region: Schema.optional(Schema.String.pipe(Schema.pattern(/^(\d{2})?$/))),
  from: DateString,
  to: DateString,
  cursor: Schema.optional(DateString),
  limit: Schema.optional(LimitFromString),
})

export class InvalidQueryError extends Data.TaggedError("InvalidQueryError")<{
  readonly detail: string
}> {}

const decodeQuery = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Effect.mapError(
    Schema.decodeUnknown(schema)(input),
    (issue) => new InvalidQueryError({ detail: TreeFormatter.formatErrorSync(issue) }),
  )

const commodityById = (id: string) =>
  Effect.fromNullable(COMMODITIES.find((c) => c.id === id)).pipe(
    Effect.mapError(() => new UnknownCommodityError({ commodityId: id })),
  )

export type SnapshotQuery = {
  date: string
  commodity: Commodity
}

/** Validate `GET /api/snapshot` search params at the boundary. */
export const parseSnapshotQuery = Effect.fn("Api.parseSnapshotQuery")(function*(input: unknown) {
  const decoded = yield* decodeQuery(SnapshotQuerySchema, input)
  const commodity = yield* commodityById(decoded.commodity)
  return { date: decoded.date, commodity } satisfies SnapshotQuery
})

export type TrendQuery = {
  commodity: Commodity
  region: string | null
  from: string
  to: string
  cursor: string | null
  limit: number
}

/** Validate `GET /api/trend` search params at the boundary. */
export const parseTrendQuery = Effect.fn("Api.parseTrendQuery")(function*(input: unknown) {
  const decoded = yield* decodeQuery(TrendQuerySchema, input)
  const commodity = yield* commodityById(decoded.commodity)
  return {
    commodity,
    region: decoded.region == null || decoded.region === "" ? null : decoded.region,
    from: decoded.from,
    to: decoded.to,
    cursor: decoded.cursor ?? null,
    limit: decoded.limit ?? 500,
  } satisfies TrendQuery
})
