import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { parseSearch, stringifySearch } from "./search-params.ts"

it.effect("writes a province code without JSON quotes and reads it back as text", () =>
  Effect.sync(() => {
    assert.strictEqual(stringifySearch({ provinsi: "31", komoditas: "beras" }), "?provinsi=31&komoditas=beras")
    assert.deepStrictEqual(parseSearch("?provinsi=31&tanggal=2026-10-23"), { provinsi: "31", tanggal: "2026-10-23" })
  }),
)

it.effect("still opens links shared with the old quoted province code", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(parseSearch("?provinsi=%2231%22"), { provinsi: "31" })
  }),
)
