import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { SNAPSHOT_META } from "#/data/snapshot.gen.ts"
import { dataBadge, latestLiveDate, pageSourceNote } from "#/data/provider.ts"

it.effect("live PIHPS page notes never claim sample data", () =>
  Effect.sync(() => {
    assert.strictEqual(SNAPSHOT_META.pricesLive, true)
    const badge = dataBadge(latestLiveDate())
    assert.ok(badge.includes("PIHPS"))
    const note = pageSourceNote(latestLiveDate())
    assert.strictEqual(note, `Harga dari PIHPS: 16 September 2026. Bukan harga hari ini.`)
    assert.ok(!/terbaru/i.test(note))
    assert.ok(!/data contoh/i.test(note))
    assert.ok(!/Data contoh/.test(note))
    assert.ok(note.includes("PIHPS"))
  }),
)
