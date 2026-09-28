import { DateTime, Effect } from "effect"

const JAKARTA = DateTime.zoneUnsafeMakeNamed("Asia/Jakarta")

/** Civil today in Asia/Jakarta, where PIHPS publishes. */
export const todayInJakarta = Effect.fn("Clock.todayJakarta")(function* () {
  const now = yield* DateTime.now
  return DateTime.formatIsoDate(DateTime.setZone(now, JAKARTA))
})
