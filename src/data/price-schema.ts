import { Data, Schema } from "effect"

const DateString = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/))

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
  price: Schema.NullOr(Schema.Number)
})

export const SnapshotSchema = Schema.Struct({
  date: DateString,
  commodity: CommoditySchema,
  nationalAvg: Schema.Number,
  pricedCount: Schema.Number,
  rows: Schema.Array(PriceRowSchema)
})

export const TrendPointSchema = Schema.Struct({
  date: DateString,
  price: Schema.Number
})

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
