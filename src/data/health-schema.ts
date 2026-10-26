import { DateTime, Option, Schema } from "effect"
import { CivilDateSchema } from "./price-schema.ts"

/** UTC instants accept both canonical formats already written by ingestion. */
export const IsoTimestampSchema = Schema.String.pipe(Schema.filter((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false
  const parsed = DateTime.make(value)
  return Option.isSome(parsed) && DateTime.formatIso(parsed.value) === (value.includes(".") ? value : value.replace("Z", ".000Z"))
}))

/** Health is pipeline evidence, separate from commodity-specific snapshot coverage. */
export const PihpsHealthSchema = Schema.Struct({
  status: Schema.Literal("ok", "waiting", "degraded", "unavailable"),
  checkedAt: IsoTimestampSchema,
  latestCheckedDate: Schema.NullOr(CivilDateSchema),
  latestPricedDate: Schema.NullOr(CivilDateSchema),
  oldestUnresolvedDate: Schema.NullOr(CivilDateSchema),
  lastAttemptAt: Schema.NullOr(IsoTimestampSchema),
  lastAttemptOutcome: Schema.NullOr(Schema.Literal("complete", "error")),
  lastSuccessfulRunAt: Schema.NullOr(IsoTimestampSchema),
})

export type PihpsHealth = typeof PihpsHealthSchema.Type
