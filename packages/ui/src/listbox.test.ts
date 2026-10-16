import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { listboxOptionClass } from "./listbox.tsx"

it.effect("selected option uses the neutral selected tint, never ember", () =>
  Effect.sync(() => {
    const selected = listboxOptionClass(true)
    assert.isTrue(selected.includes("bg-selected"))
    assert.isFalse(selected.includes("ember"))
    assert.isTrue(listboxOptionClass(false).includes("hover:bg-muted"))
  }),
)
