import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { parseLaporanSearch } from "./laporan-search.ts"

const provinces = new Set(["31", "32"])

it.effect("opens laporan without an outlet query and keeps ritel explicit", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(parseLaporanSearch({}, provinces), {})
    assert.deepStrictEqual(parseLaporanSearch({ outlet: "pasar" }, provinces), {})
    assert.deepStrictEqual(parseLaporanSearch({ outlet: "ritel" }, provinces), { outlet: "ritel" })
    assert.deepStrictEqual(parseLaporanSearch({ outlet: "pasar", komoditas: "beras" }, provinces), {
      komoditas: "beras",
    })
    assert.deepStrictEqual(parseLaporanSearch({ provinsi: "31" }, provinces), { provinsi: "31" })
    assert.deepStrictEqual(parseLaporanSearch({ provinsi: "99" }, provinces), {})
  }),
)
