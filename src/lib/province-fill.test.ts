import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { provinceFill } from "./province-fill.ts"

it.effect("paints a province with no price black", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(provinceFill(null, 16350), {
      fillColor: "#1a1c16",
      fillOpacity: 0.9,
    })
    assert.deepStrictEqual(provinceFill(undefined, 16350), {
      fillColor: "#1a1c16",
      fillOpacity: 0.9,
    })
  }),
)

it.effect("keeps priced provinces on the existing average bands", () =>
  Effect.sync(() => {
    assert.deepStrictEqual(provinceFill(14000, 16350), {
      fillColor: "#00714c",
      fillOpacity: 0.65,
    })
    assert.deepStrictEqual(provinceFill(16350, 16350), {
      fillColor: "#eab308",
      fillOpacity: 0.65,
    })
    assert.deepStrictEqual(provinceFill(19000, 16350), {
      fillColor: "#dc2626",
      fillOpacity: 0.65,
    })
  }),
)
