import { Context, Effect, Layer } from "effect"
import { COMMODITIES } from "./catalog.ts"
import { provider, type PriceDataProvider, type TrendRange } from "./provider.ts"
import { UnknownCommodityError, UnknownDateError } from "./price-schema.ts"

export class PriceDataService extends Context.Tag("PriceDataService")<
  PriceDataService,
  PriceDataProvider
>() {
  static Live = Layer.succeed(PriceDataService, provider)
}

export const getDates = Effect.fn("PriceData.getDates")(function*() {
  const service = yield* PriceDataService
  return service.dates()
})

export const getProvinces = Effect.fn("PriceData.getProvinces")(function*() {
  const service = yield* PriceDataService
  return service.provinces()
})

export const getSnapshot = Effect.fn("PriceData.getSnapshot")(function*(
  date: string,
  commodityId: string
) {
  const service = yield* PriceDataService
  if (!service.dates().includes(date)) {
    return yield* new UnknownDateError({ date })
  }
  const commodity = COMMODITIES.find((c) => c.id === commodityId)
  if (commodity === undefined) {
    return yield* new UnknownCommodityError({ commodityId })
  }
  return service.snapshot(date, commodity.id)
})

export const getTrend = Effect.fn("PriceData.getTrend")(function*(
  commodityId: string,
  regionCode?: string | null,
  range?: Partial<TrendRange>
) {
  const service = yield* PriceDataService
  const commodity = COMMODITIES.find((c) => c.id === commodityId)
  if (commodity === undefined) {
    return yield* new UnknownCommodityError({ commodityId })
  }
  return service.trend(commodity.id, regionCode, range)
})
