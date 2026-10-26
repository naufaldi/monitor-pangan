import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { buttonClass, cn, focusRing, inputClass, selectClass } from "./primitives.tsx"

const has = (classes: string, token: string): boolean => classes.split(" ").includes(token)

it.effect("every button variant has a focus ring and a visible disabled state", () =>
  Effect.sync(() => {
    for (const variant of ["pill", "rect", "primary"] as const) {
      const classes = buttonClass(variant)
      assert.isTrue(has(classes, "focus-visible:outline-2"), variant)
      assert.isTrue(has(classes, "focus-visible:outline-solid"), variant)
      assert.isTrue(has(classes, "focus-visible:outline-ring"), variant)
      assert.isTrue(has(classes, "disabled:opacity-50"), variant)
      assert.isTrue(has(classes, "disabled:active:scale-100"), variant)
    }
  }),
)

it.effect("primary is a leaf-deep fill and ignores active", () =>
  Effect.sync(() => {
    const classes = buttonClass("primary", true)
    assert.isTrue(has(classes, "bg-leaf-deep"))
    assert.isTrue(has(classes, "text-paper"))
    assert.isFalse(has(classes, "bg-ink"))
  }),
)

it.effect("inputs and selects share 44px height, radius and hairline border", () =>
  Effect.sync(() => {
    for (const classes of [inputClass(), selectClass()]) {
      assert.isTrue(has(classes, "min-h-11"))
      assert.isTrue(has(classes, "rounded-lg"))
      assert.isTrue(has(classes, "border-hairline"))
      assert.isTrue(has(classes, "focus-visible:outline-solid"))
      assert.isTrue(has(classes, "focus-visible:outline-ring"))
    }
  }),
)

it.effect("row focus keeps the solid ring when its offset moves inside the row", () =>
  Effect.sync(() => {
    const classes = cn(focusRing, "focus-visible:outline-offset-[-2px]")
    assert.isTrue(has(classes, "outline-none"))
    assert.isTrue(has(classes, "focus-visible:outline-solid"))
    assert.isTrue(has(classes, "focus-visible:outline-2"))
    assert.isTrue(has(classes, "focus-visible:outline-ring"))
    assert.isTrue(has(classes, "focus-visible:outline-offset-[-2px]"))
    assert.isFalse(has(classes, "focus-visible:outline-offset-2"))
  }),
)
