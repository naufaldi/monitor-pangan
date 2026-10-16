import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { tdClass, thClass } from "./table.ts"

it.effect("header cells share one style and align numbers right", () =>
  Effect.sync(() => {
    assert.isTrue(thClass("start").includes("bg-muted"))
    assert.isTrue(thClass("end").includes("text-right"))
    assert.isFalse(thClass("start").includes("uppercase"))
  }),
)

it.effect("numeric body cells never wrap", () =>
  Effect.sync(() => {
    const cell = tdClass("end")
    assert.isTrue(cell.includes("tabular-nums"))
    assert.isTrue(cell.includes("whitespace-nowrap"))
    assert.isTrue(cell.includes("text-right"))
  }),
)
