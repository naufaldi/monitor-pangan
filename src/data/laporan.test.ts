import { Effect, Schema } from "effect"
import { assert, it } from "@effect/vitest"
import { SubmitBodySchema, reportFieldErrors } from "#/data/laporan.ts"

it.effect("names each missing or invalid report field instead of failing the whole form", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(reportFieldErrors({ price: null, placeCode: "", alias: "" }), {
      price: "Isi harga yang Anda lihat.",
      place: "Pilih kota atau kabupaten.",
    })
    assert.deepStrictEqual(reportFieldErrors({ price: 99, placeCode: "3171", alias: "lihat www.contoh.id" }), {
      price: "Harga harus antara Rp 100 dan Rp 1.000.000.",
      alias: "Nama panggilan tidak boleh berisi tautan.",
    })
    assert.deepStrictEqual(reportFieldErrors({ price: 1_000_001, placeCode: "3171", alias: "" }).price, "Harga harus antara Rp 100 dan Rp 1.000.000.")
  }),
)

it.effect("accepts exactly what the submit schema accepts at the bounds", () =>
  Effect.sync(() => {
    for (const price of [100, 1_000_000]) {
      assert.deepStrictEqual(reportFieldErrors({ price, placeCode: "3171", alias: "Bu Sri" }), {})
      const decoded = Schema.decodeUnknownEither(SubmitBodySchema)({
        id: "6f1c1f0e-8b7a-4c1e-9d8a-2f3b4c5d6e7f",
        commodityId: "beras",
        outlet: "pasar",
        price,
        placeCode: "3171",
        alias: "Bu Sri",
        photo: false,
        turnstileToken: "token",
      })
      assert.strictEqual(decoded._tag, "Right")
    }
  }),
)
