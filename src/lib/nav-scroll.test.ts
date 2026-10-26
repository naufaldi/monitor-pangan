import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { revealScrollLeft } from "./nav-scroll.ts"

// A 390px phone nav: 16px gutter, pills laid out past the right edge.
const view = { scrollLeft: 0, width: 390 }

it.effect("an off-screen pill on the right scrolls in with the gutter kept", () => Effect.sync(() => {
  assert.strictEqual(revealScrollLeft(view, { left: 481, right: 617 }, 16), 617 + 16 - 390)
}))

it.effect("a pill hidden on the left scrolls back to its gutter edge", () => Effect.sync(() => {
  assert.strictEqual(revealScrollLeft({ scrollLeft: 243, width: 390 }, { left: 16, right: 72 }, 16), 0)
  assert.strictEqual(revealScrollLeft({ scrollLeft: 243, width: 390 }, { left: 171, right: 259 }, 16), 155)
}))

it.effect("a visible pill leaves the scroll position alone", () => Effect.sync(() => {
  assert.strictEqual(revealScrollLeft(view, { left: 171, right: 259 }, 16), 0)
  assert.strictEqual(revealScrollLeft({ scrollLeft: 100, width: 390 }, { left: 171, right: 259 }, 16), 100)
}))
