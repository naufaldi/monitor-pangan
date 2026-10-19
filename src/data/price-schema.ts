import { Data, Schema } from "effect"
import { addIsoDays } from "../lib/civil-date.ts"
import { COMMODITIES } from "./catalog.ts"
import { REGION_ROWS } from "./pihps-catalog.ts"
import { summarizePrices } from "./price-summary.ts"

/** Round-trip a civil date without a runtime clock or timezone conversion. */
export const CivilDateSchema = Schema.String.pipe(Schema.filter((date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 4) !== "0000" && addIsoDays(date, 0) === date,
  { message: () => "Expected a valid YYYY-MM-DD calendar date" },
))
const DateString = CivilDateSchema
export const CommodityIdSchema = Schema.String.pipe(Schema.filter((id) => COMMODITIES.some((commodity) => commodity.id === id)))
export const RegionCodeSchema = Schema.String.pipe(Schema.filter((code) => REGION_ROWS.some(([region]) => region === code)))
const ObservedPrice = Schema.Number.pipe(Schema.finite(), Schema.positive())

export const PriceUnitSchema = Schema.Literal("kg", "liter")

export const CommoditySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.NonEmptyString,
  unit: PriceUnitSchema,
  group: Schema.String,
  anchor: Schema.Number
})

export const PriceRowSchema = Schema.Struct({
  regionCode: Schema.NonEmptyString,
  price: Schema.NullOr(ObservedPrice)
})

export const SnapshotSchema = Schema.Struct({
  date: DateString,
  commodity: CommoditySchema,
  nationalAvg: Schema.NullOr(Schema.Number.pipe(Schema.finite(), Schema.nonNegative())),
  pricedCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  rows: Schema.Array(PriceRowSchema)
}).pipe(Schema.filter((snapshot) => {
  const summary = summarizePrices(snapshot.rows)
  return snapshot.pricedCount === summary.pricedCount &&
    snapshot.nationalAvg === summary.nationalAvg
}, { message: () => "Snapshot summary must match its observed provincial prices" }))

/** The HTTP snapshot contract always includes the complete province grid. */
export const CanonicalSnapshotSchema = SnapshotSchema.pipe(Schema.filter((snapshot) =>
  snapshot.rows.length === REGION_ROWS.length && snapshot.rows.every((row, index) => row.regionCode === REGION_ROWS[index]?.[0]),
  { message: () => "Snapshot rows must follow the canonical 38-province grid" },
))

export const TrendPointSchema = Schema.Struct({
  date: DateString,
  price: ObservedPrice
})

export const SnapshotQuerySchema = Schema.Struct({ date: CivilDateSchema, commodityId: CommodityIdSchema })
export const TrendPageQuerySchema = Schema.Struct({
  commodityId: CommodityIdSchema,
  regionCode: Schema.optional(RegionCodeSchema),
  from: CivilDateSchema,
  to: CivilDateSchema,
  cursor: Schema.optional(CivilDateSchema),
  limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 2000)),
}).pipe(Schema.filter((query) => query.from <= query.to &&
  (query.cursor == null || (query.cursor >= query.from && query.cursor <= query.to))))

const increasingDates = (points: readonly { readonly date: string }[]) =>
  points.every((point, index) => index === 0 || points[index - 1]!.date < point.date)

export const TrendPageSchema = Schema.Struct({
  national: Schema.Array(TrendPointSchema),
  selected: Schema.NullOr(Schema.Array(TrendPointSchema)),
  nextCursor: Schema.NullOr(CivilDateSchema),
}).pipe(Schema.filter((page) => increasingDates(page.national) &&
  (page.selected == null || (increasingDates(page.selected) && page.selected.every((point) => page.national.some((national) => national.date === point.date)))) &&
  (page.nextCursor == null || page.nextCursor === page.national.at(-1)?.date)))

export type TrendPageQuery = typeof TrendPageQuerySchema.Type
export type TrendPage = typeof TrendPageSchema.Type

export const TrendResolutionSchema = Schema.Literal("day", "week", "month")

export const TrendRangeSchema = Schema.Struct({
  from: DateString,
  to: DateString,
  resolution: TrendResolutionSchema
})

export const TrendSeriesSchema = Schema.Struct({
  commodity: CommoditySchema,
  unit: PriceUnitSchema,
  national: Schema.Array(TrendPointSchema),
  selected: Schema.NullOr(Schema.Array(TrendPointSchema)),
  changePct: Schema.Number,
  direction: Schema.Literal("up", "down", "flat"),
  range: TrendRangeSchema
})

export type SnapshotValidated = typeof SnapshotSchema.Type
export type TrendSeriesValidated = typeof TrendSeriesSchema.Type

export class UnknownCommodityError extends Data.TaggedError("UnknownCommodityError")<{
  readonly commodityId: string
}> {}

export class UnknownDateError extends Data.TaggedError("UnknownDateError")<{
  readonly date: string
}> {}

export const decodeSnapshot = Schema.decodeUnknown(SnapshotSchema)

export const decodeTrendSeries = Schema.decodeUnknown(TrendSeriesSchema)
