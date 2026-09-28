import { Schema } from "effect"

const IsoDate = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/))

/** JSON the worker injects and `/api/pihps/fresh` returns. */
export const FreshPayloadSchema = Schema.Struct({
  latestDate: Schema.NullOr(IsoDate),
  dates: Schema.Array(IsoDate),
  prices: Schema.Record({ key: Schema.String, value: Schema.Number }),
})

export type FreshPayload = typeof FreshPayloadSchema.Type

export const emptyFreshPayload: FreshPayload = {
  latestDate: null,
  dates: [],
  prices: {},
}
