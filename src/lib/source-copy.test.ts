import { Effect, TestClock } from "effect"
import { assert, it } from "@effect/vitest"
import { applyFreshPrices, clearFreshPrices } from "#/data/fresh-prices.ts"
import { SNAPSHOT_META } from "#/data/snapshot.gen.ts"
import { dataBadge, latestLiveDate, pageSourceNote } from "#/data/provider.ts"
import { todayInJakarta } from "#/lib/jakarta-today.ts"

const JAKARTA_28_SEP = 1790579700000

it.effect("live PIHPS page notes never claim sample data", () =>
  Effect.sync(() => {
    assert.strictEqual(SNAPSHOT_META.pricesLive, true)
    const badge = dataBadge(latestLiveDate())
    assert.ok(badge.includes("PIHPS"))
    const note = pageSourceNote(latestLiveDate(), "2026-09-28")
    assert.strictEqual(note, `Harga dari PIHPS: 16 September 2026. Bukan harga hari ini.`)
    assert.ok(!/terbaru/i.test(note))
    assert.ok(!/data contoh/i.test(note))
    assert.ok(!/Data contoh/.test(note))
    assert.ok(note.includes("PIHPS"))
  }),
)

it.effect("page note denies today only when the PIHPS day is older", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(JAKARTA_28_SEP)
    const today = yield* todayInJakarta()
    assert.strictEqual(today, "2026-09-28")
    assert.strictEqual(
      pageSourceNote("2026-09-01", today),
      "Harga dari PIHPS: 1 September 2026. Bukan harga hari ini.",
    )
    applyFreshPrices({
      latestDate: today,
      dates: [today],
      prices: { [`${today}:beras:31`]: 16950 },
    })
    assert.strictEqual(pageSourceNote(today, today), "Harga dari PIHPS: 28 September 2026.")
    assert.ok(!pageSourceNote(today, today).includes("Bukan harga hari ini"))
  }).pipe(Effect.ensuring(Effect.sync(() => clearFreshPrices()))),
)
