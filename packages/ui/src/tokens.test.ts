import { readFileSync } from "node:fs"
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { color } from "./tokens.ts"

const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

it.effect("tokens.ts mirrors every color in tokens.css", () =>
  Effect.sync(() => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8")
    for (const [key, hex] of Object.entries(color)) {
      const match = css.match(new RegExp(`--color-${kebab(key)}:\\s*(#[0-9a-fA-F]{6});`))
      assert.isNotNull(match, `--color-${kebab(key)} missing from tokens.css`)
      assert.strictEqual(match![1]!.toLowerCase(), hex)
    }
  }),
)
