import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { directionGlyph, directionTextClass } from "./delta.tsx"

it.effect("one glyph per direction", () =>
  Effect.sync(() => {
    assert.strictEqual(directionGlyph("up"), "▲")
    assert.strictEqual(directionGlyph("down"), "▼")
    assert.strictEqual(directionGlyph("flat"), "•")
  }),
)

it.effect("price up is ember, price down is leaf-deep, flat is slate", () =>
  Effect.sync(() => {
    assert.strictEqual(directionTextClass("up"), "text-ember")
    assert.strictEqual(directionTextClass("down"), "text-leaf-deep")
    assert.strictEqual(directionTextClass("flat"), "text-slate")
  }),
)
