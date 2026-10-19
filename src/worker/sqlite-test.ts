import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { Effect } from "effect"
import { afterEach } from "vitest"
import { ensureMigrated, type D1Database, type D1Prepared } from "./d1-store.ts"

/** Executes the production SQL with SQLite, adapting only the D1 transport. */
const databases = new Set<DatabaseSync>()
afterEach(() => {
  for (const database of databases) database.close()
  databases.clear()
})

export const sqliteFixture = Effect.gen(function* () {
  const sqlite = yield* Effect.sync(() => {
    const database = new DatabaseSync(":memory:")
    databases.add(database)
    return database
  })
  const prepare = (sql: string, values: SQLInputValue[] = []): D1Prepared => ({
    bind: (...bound) => prepare(sql, bound as SQLInputValue[]),
    all: <T>() => Promise.resolve({ results: sqlite.prepare(sql).all(...values) as T[] }),
    run: () => Promise.resolve(sqlite.prepare(sql).run(...values)),
  })
  const db: D1Database = {
    prepare,
    batch: (statements) => Promise.all(statements.map((statement) => statement.run())),
    exec: (sql) => Promise.resolve(sqlite.exec(sql)),
  }
  yield* ensureMigrated(db)
  const price = (date: string, region: string, value: number | string | null, commodity = "beras", source = "pihps", level = "eceran") =>
    Effect.sync(() => sqlite.prepare("INSERT OR REPLACE INTO prices_daily (date, commodity_id, region_code, price, source_id, level) VALUES (?, ?, ?, ?, ?, ?)")
      .run(date, commodity, region, value, source, level))
  const coverage = (date: string, status: string) =>
    Effect.sync(() => sqlite.prepare("INSERT OR REPLACE INTO source_days VALUES (?, 'pihps', ?, '2026-10-19T00:00:00Z')").run(date, status))
  return { db, sqlite, price, coverage }
})
