import { DateTime, Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { loadProvinces } from "#/data/geo.ts"
import type { PublicReport } from "#/data/laporan.ts"
import { PLACES, placeByCode } from "#/data/places.ts"
import { jpegHasExif, PHOTO_MAX_EDGE, fittedSize } from "#/lib/photo.ts"
import {
  cityMedian,
  inWindow,
  medianRounded,
  photoPresentation,
  pins,
  provinceOutline,
  provinceRollup,
  reportHasPhoto,
  windowStart,
  PHOTO_RETENTION_MS,
} from "#/lib/laporan.ts"

const day = 24 * 60 * 60 * 1000

const report = (
  placeCode: string,
  price: number,
  outlet: PublicReport["outlet"] = "pasar",
  commodityId = "beras",
): PublicReport => ({
  id: `${placeCode}-${price}-${outlet}-${commodityId}`,
  commodityId,
  outlet,
  price,
  placeCode,
  seenOn: "2026-10-01",
  alias: null,
  evidence: "receipt",
  hasPhoto: false,
})

const names = (code: string): string => {
  switch (code) {
    case "3274":
      return "Kota Cirebon"
    case "3273":
      return "Kota Bandung"
    case "3275":
      return "Kota Bekasi"
    case "3201":
      return "Kabupaten Bogor"
    default:
      return code
  }
}

it.effect("the public window is 30 civil days including today", () =>
  Effect.sync(() => {
    assert.strictEqual(windowStart("2026-10-08"), "2026-09-09")
    assert.strictEqual(inWindow("2026-09-09", "2026-10-08"), true)
    assert.strictEqual(inWindow("2026-10-08", "2026-10-08"), true)
    assert.strictEqual(inWindow("2026-09-08", "2026-10-08"), false)
  }),
)

it.effect("hasPhoto is false once the decision is 30 days old", () =>
  Effect.sync(() => {
    const now = DateTime.unsafeMake("2026-10-08T03:00:00.000Z").epochMillis
    const fresh = DateTime.formatIso(DateTime.unsafeMake(now - PHOTO_RETENTION_MS + 1))
    const expired = DateTime.formatIso(DateTime.unsafeMake(now - PHOTO_RETENTION_MS))
    assert.strictEqual(reportHasPhoto("decided/a.jpg", fresh, now), true)
    assert.strictEqual(reportHasPhoto("decided/a.jpg", expired, now), false)
    assert.strictEqual(reportHasPhoto(null, fresh, now), false)
    assert.strictEqual(PHOTO_RETENTION_MS, 30 * day)
  }),
)

it.effect("an even median rounds the middle pair to the nearest 50 rupiah", () =>
  Effect.sync(() => {
    assert.strictEqual(medianRounded([13000, 14500, 16500]), 14500)
    assert.strictEqual(medianRounded([10000, 13020, 14040, 16000]), 13550)
  }),
)

it.effect("pins stay on one outlet and one place", () =>
  Effect.sync(() => {
    const rows = [
      report("3273", 16000, "pasar"),
      report("3273", 17000, "pasar"),
      report("3274", 13000, "ritel"),
      report("3275", 15000, "pasar", "gula-pasir"),
    ]
    assert.deepStrictEqual(pins(rows, "pasar", "beras"), [{ placeCode: "3273", count: 2 }])
    assert.deepStrictEqual(pins(rows, "ritel", "beras"), [{ placeCode: "3274", count: 1 }])
    assert.deepStrictEqual(pins(rows, "pasar", null).map((pin) => pin.placeCode), ["3273", "3275"])
  }),
)

it.effect("a city median waits for three reports", () =>
  Effect.sync(() => {
    const rows = [report("3273", 16000), report("3273", 17000)]
    assert.strictEqual(cityMedian(rows, "3273", "beras", "pasar"), null)
    const three = [...rows, report("3273", 18000)]
    assert.deepStrictEqual(cityMedian(three, "3273", "beras", "pasar"), { median: 17000, count: 3 })
  }),
)

it.effect("three pasar cities name the middle median and the ends", () =>
  Effect.sync(() => {
    const rows = [report("3274", 13000), report("3275", 14500), report("3273", 16500)]
    const rollup = provinceRollup(rows, "32", "beras", "pasar", names)
    assert.strictEqual(rollup.kind, "median")
    if (rollup.kind !== "median") return
    assert.strictEqual(rollup.median, 14500)
    assert.deepStrictEqual(rollup.low, { name: "Kota Cirebon", median: 13000 })
    assert.deepStrictEqual(rollup.high, { name: "Kota Bandung", median: 16500 })
    assert.strictEqual(rollup.cityCount, 3)
    assert.strictEqual(rollup.reportCount, 3)
  }),
)

it.effect("two ritel cities stay under the floor", () =>
  Effect.sync(() => {
    const rows = [report("3273", 18000, "ritel"), report("3273", 19000, "ritel"), report("3274", 20000, "ritel")]
    const rollup = provinceRollup(rows, "32", "beras", "ritel", names)
    assert.strictEqual(rollup.kind, "floor")
    if (rollup.kind !== "floor") return
    assert.strictEqual(rollup.cityCount, 2)
    assert.strictEqual(rollup.reportCount, 3)
  }),
)

it.effect("a province median is unweighted by report count", () =>
  Effect.sync(() => {
    const bandung = Array.from({ length: 20 }, (_, index) => report("3273", index % 2 === 0 ? 9000 : 11000))
    const rows = [...bandung, report("3274", 20000), report("3275", 30000)]
    const rollup = provinceRollup(rows, "32", "beras", "pasar", names)
    assert.strictEqual(rollup.kind, "median")
    if (rollup.kind !== "median") return
    assert.strictEqual(rollup.median, 20000)
    assert.strictEqual(rollup.reportCount, 22)
    assert.strictEqual(rollup.cityCount, 3)
  }),
)

it.effect("four city medians round the two middle values", () =>
  Effect.sync(() => {
    const rows = [
      report("3201", 10000),
      report("3274", 13020),
      report("3275", 14040),
      report("3273", 16000),
    ]
    const rollup = provinceRollup(rows, "32", "beras", "pasar", names)
    assert.strictEqual(rollup.kind, "median")
    if (rollup.kind !== "median") return
    assert.strictEqual(rollup.median, 13550)
  }),
)

it.effect("no commodity lists cities and counts without a price", () =>
  Effect.sync(() => {
    const rows = [report("3273", 16000), report("3273", 17000), report("3274", 13000, "ritel")]
    const rollup = provinceRollup(rows, "32", null, "pasar", names)
    assert.strictEqual(rollup.kind, "counts")
    if (rollup.kind !== "counts") return
    assert.strictEqual(rollup.cityCount, 1)
    assert.strictEqual(rollup.reportCount, 2)
    assert.strictEqual("median" in rollup, false)
  }),
)

it.effect("ritel prices do not move the pasar median", () =>
  Effect.sync(() => {
    const rows = [
      report("3274", 13000),
      report("3275", 14500),
      report("3273", 16500),
      report("3273", 90000, "ritel"),
    ]
    const rollup = provinceRollup(rows, "32", "beras", "pasar", names)
    assert.strictEqual(rollup.kind, "median")
    if (rollup.kind !== "median") return
    assert.strictEqual(rollup.median, 14500)
  }),
)

it.effect("province outlines have no fill", () =>
  Effect.sync(() => {
    assert.strictEqual(provinceOutline.fillOpacity, 0)
  }),
)

it.effect("a removed photo keeps a receipt label and a missing photo does not", () =>
  Effect.sync(() => {
    assert.strictEqual(photoPresentation({ hasPhoto: true, evidence: "receipt" }), "image")
    assert.strictEqual(photoPresentation({ hasPhoto: false, evidence: "receipt" }), "removed")
    assert.strictEqual(photoPresentation({ hasPhoto: false, evidence: "none" }), "label")
  }),
)

it.effect("the place list is 514 kab/kota on the 38 province codes", () =>
  Effect.sync(() => {
    assert.strictEqual(PLACES.length, 514)
    const provinces = new Set(loadProvinces().map((province) => province.code))
    for (const place of PLACES) {
      assert.strictEqual(place.code.length, 4)
      assert.strictEqual(place.provinceCode, place.code.slice(0, 2))
      assert.strictEqual(provinces.has(place.provinceCode), true)
      assert.strictEqual(Number.isFinite(place.latitude), true)
      assert.strictEqual(Number.isFinite(place.longitude), true)
    }
    const wakatobi = placeByCode("7407")
    assert.ok(wakatobi)
    assert.ok(wakatobi.longitude > 100)
    assert.strictEqual(placeByCode("0000"), null)
  }),
)

it.effect("fitted photos cap the long edge at 1600 and a re-encoded jpeg has no exif marker", () =>
  Effect.sync(() => {
    assert.strictEqual(PHOTO_MAX_EDGE, 1600)
    assert.deepStrictEqual(fittedSize(3200, 1600), { width: 1600, height: 800 })
    assert.deepStrictEqual(fittedSize(800, 600), { width: 800, height: 600 })
    assert.deepStrictEqual(fittedSize(1000, 4000), { width: 400, height: 1600 })
    const exif = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd9,
    ])
    const clean = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
    assert.strictEqual(jpegHasExif(exif), true)
    assert.strictEqual(jpegHasExif(clean), false)
  }),
)
