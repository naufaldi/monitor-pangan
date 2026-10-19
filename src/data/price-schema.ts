import { Data, Schema } from "effect"
import { summarizePrices } from "./price-summary.ts"

const DateString = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/))
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
