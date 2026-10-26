import { Data, Effect, Schema } from "effect"
import { CivilDateSchema, CommodityIdSchema, RegionCodeSchema } from "./price-schema.ts"
import { parseQuantity } from "#/lib/basket.ts"

export const BASKET_STORAGE_KEY = "monitor-pangan:basket:v1"
const Hundredths = Schema.Number.pipe(Schema.int(), Schema.between(0, 100000))
export const SavedBasketSchema = Schema.Struct({
  version: Schema.Literal(1),
  province: RegionCodeSchema,
  date: CivilDateSchema,
  comparisonDate: Schema.NullOr(CivilDateSchema),
  quantities: Schema.Record({ key: CommodityIdSchema, value: Hundredths }),
}).pipe(Schema.filter((basket) =>
  (basket.comparisonDate == null || basket.comparisonDate < basket.date) &&
  Object.values(basket.quantities).some((quantity) => quantity > 0),
))
export type SavedBasket = typeof SavedBasketSchema.Type
export type BasketStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export class BasketStorageError extends Data.TaggedError("BasketStorageError")<{ readonly kind: "unavailable" | "invalid" }> {}

/** Storage getters can throw, including when the browser denies localStorage itself. */
export const browserBasketStorage: BasketStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
}

export const loadBasket = Effect.fn("Basket.load")(function* (storage: BasketStorage) {
  const raw = yield* Effect.try({ try: () => storage.getItem(BASKET_STORAGE_KEY), catch: () => new BasketStorageError({ kind: "unavailable" }) })
  if (raw == null) return null
  if (raw.length > 4096) return yield* Effect.fail(new BasketStorageError({ kind: "invalid" }))
  return yield* Schema.decodeUnknown(Schema.parseJson(SavedBasketSchema))(raw, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new BasketStorageError({ kind: "invalid" })),
  )
})

/** Persist input only. Prices and totals must be recalculated after restoration. */
export const saveBasket = Effect.fn("Basket.save")(function* (storage: BasketStorage, basket: SavedBasket) {
  const encoded = yield* Schema.encode(Schema.parseJson(SavedBasketSchema))(basket, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new BasketStorageError({ kind: "invalid" })),
  )
  yield* Effect.try({ try: () => storage.setItem(BASKET_STORAGE_KEY, encoded), catch: () => new BasketStorageError({ kind: "unavailable" }) })
})

export const clearBasket = (storage: BasketStorage) => Effect.try({
  try: () => storage.removeItem(BASKET_STORAGE_KEY), catch: () => new BasketStorageError({ kind: "unavailable" }),
})

export function basketToSave(province: string, date: string, comparisonDate: string | null, inputs: Record<string, string>): SavedBasket | null {
  const quantities: Record<string, number> = {}
  for (const [id, input] of Object.entries(inputs)) {
    const parsed = parseQuantity(input)
    if (!parsed.valid) return null
    quantities[id] = parsed.hundredths
  }
  const basket = { version: 1 as const, province, date, comparisonDate, quantities }
  return Schema.is(SavedBasketSchema, { onExcessProperty: "error" })(basket) ? basket : null
}

export function restoredQuantities(basket: SavedBasket): Record<string, string> {
  return Object.fromEntries(Object.entries(basket.quantities).map(([id, value]) => [id, String(value / 100)]))
}
