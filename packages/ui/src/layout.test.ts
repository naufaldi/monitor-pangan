import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { navPillClass } from "./layout.tsx"

it.effect("nav pills keep their focus outline clear of horizontal scroll edges", () =>
  Effect.sync(() => {
    for (const active of [false, true]) {
      const classes = navPillClass(active).split(" ")
      assert.include(classes, "scroll-mx-1")
      assert.include(classes, "shrink-0")
      assert.include(classes, "whitespace-nowrap")
      assert.include(classes, "focus-visible:outline-solid")
      assert.include(classes, "focus-visible:outline-2")
      assert.include(classes, "focus-visible:outline-offset-2")
    }
  }),
)
