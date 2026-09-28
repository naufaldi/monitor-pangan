import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { migrationStatements } from "./d1-store.ts"

it.effect("splits the D1 schema into complete statements", () =>
  Effect.sync(() => {
    const statements = migrationStatements()
    assert.ok(statements.length > 40)
    const commodities = statements[0]
    assert.ok(commodities?.startsWith("CREATE TABLE IF NOT EXISTS commodities"))
    assert.ok(commodities?.includes("PRIMARY KEY"))
    assert.ok(statements.some((statement) => statement.startsWith("CREATE TABLE IF NOT EXISTS source_days")))
    for (const statement of statements) {
      const opened = [...statement].filter((char) => char === "(").length
      const closed = [...statement].filter((char) => char === ")").length
      assert.strictEqual(opened, closed)
    }
  }),
)
