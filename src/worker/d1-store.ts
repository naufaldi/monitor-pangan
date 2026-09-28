import { Effect, Layer } from "effect"
import { COMMODITY_ROWS, REGION_ROWS } from "../data/pihps-catalog.ts"
import type { FreshPayload } from "../data/fresh-payload.ts"
import type { PihpsPriceCell } from "../data/pihps-grid.ts"
import { PriceStore, StoreError, type JobRecord } from "./ingest.ts"

export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

export interface D1Database {
  prepare(sql: string): D1Prepared
  batch(statements: D1Prepared[]): Promise<unknown>
  exec(sql: string): Promise<unknown>
}

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`

const MIGRATE_SQL = `
CREATE TABLE IF NOT EXISTS commodities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'liter'))
);
CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'province'
);
CREATE TABLE IF NOT EXISTS prices_daily (
  date TEXT NOT NULL,
  commodity_id TEXT NOT NULL REFERENCES commodities (id),
  region_code TEXT NOT NULL REFERENCES regions (code),
  level TEXT NOT NULL DEFAULT 'eceran',
  price INTEGER,
  source_id TEXT NOT NULL,
  raw_ref TEXT,
  PRIMARY KEY (date, commodity_id, region_code, level)
);
CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE TABLE IF NOT EXISTS source_days (
  date TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (date, source_id)
);
${COMMODITY_ROWS.map(
  ([id, name, unit]) =>
    `INSERT OR IGNORE INTO commodities (id, name, unit) VALUES (${sqlString(id)}, ${sqlString(name)}, ${sqlString(unit)});`,
).join("\n")}
${REGION_ROWS.map(
  ([code, name]) =>
    `INSERT OR IGNORE INTO regions (code, name, level) VALUES (${sqlString(code)}, ${sqlString(name)}, 'province');`,
).join("\n")}
`

const storeError = (cause: unknown) => new StoreError({ message: String(cause) })

/** Split the schema script into single statements. D1 `exec` of the whole script reports incomplete input. */
export const migrationStatements = (sql: string = MIGRATE_SQL): readonly string[] =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)

let migrated: Promise<void> | undefined

const runStatements = (db: D1Database, statements: readonly string[], index: number): Promise<void> => {
  const statement = statements[index]
  if (statement === undefined) return Promise.resolve()
  return db.prepare(statement).run().then(() => runStatements(db, statements, index + 1))
}

const migrate = (db: D1Database): Promise<void> => {
  if (migrated !== undefined) return migrated
  const pending = runStatements(db, migrationStatements(), 0).then(
    () => undefined,
    (cause: unknown) => {
      if (migrated === pending) migrated = undefined
      throw cause
    },
  )
  migrated = pending
  return pending
}

/** D1 binding for the monitor-pangan database. */
export const d1PriceStoreLayer = (db: D1Database) => {
  const ensure = Effect.tryPromise({
    try: () => migrate(db),
    catch: storeError,
  })

  const latestCheckedDate = ensure.pipe(
    Effect.andThen(() =>
      Effect.tryPromise({
        try: () =>
          db
            .prepare("SELECT MAX(date) AS latest FROM source_days WHERE source_id = 'pihps'")
            .all<{ latest: string | null }>(),
        catch: storeError,
      }),
    ),
    Effect.map((out) => out.results[0]?.latest ?? null),
  )

  const upsertDay = (
    date: string,
    status: "live" | "empty",
    rows: readonly PihpsPriceCell[],
    checkedAt: string,
  ) =>
    Effect.gen(function* () {
      yield* ensure
      const chunks: PihpsPriceCell[][] = []
      for (let i = 0; i < rows.length; i += 40) chunks.push([...rows.slice(i, i + 40)])
      yield* Effect.forEach(
        chunks,
        (chunk) =>
          Effect.tryPromise({
            try: () =>
              db.batch(
                chunk.map((row) =>
                  db
                    .prepare(
                      "INSERT OR REPLACE INTO prices_daily (date, commodity_id, region_code, level, price, source_id) VALUES (?, ?, ?, 'eceran', ?, 'pihps')",
                    )
                    .bind(row.date, row.commodityId, row.regionCode, row.price),
                ),
              ),
            catch: storeError,
          }),
        { concurrency: 1 },
      )
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              "INSERT OR REPLACE INTO source_days (date, source_id, status, checked_at) VALUES (?, 'pihps', ?, ?)",
            )
            .bind(date, status, checkedAt)
            .run(),
        catch: storeError,
      })
      return rows.length
    })

  const recordJob = (job: JobRecord) =>
    ensure.pipe(
      Effect.andThen(() =>
        Effect.tryPromise({
          try: () =>
            db
              .prepare(
                "INSERT INTO job_runs (started_at, source_id, status, rows_upserted, note) VALUES (?, 'pihps', ?, ?, ?)",
              )
              .bind(job.startedAt, job.status, job.rowsUpserted, job.note)
              .run(),
          catch: storeError,
        }),
      ),
      Effect.asVoid,
    )

  const freshSince = (after: string) =>
    ensure.pipe(
      Effect.andThen(() =>
        Effect.tryPromise({
          try: () =>
            db
              .prepare(
                "SELECT date, commodity_id, region_code, price FROM prices_daily WHERE source_id = 'pihps' AND price IS NOT NULL AND date > ? ORDER BY date, commodity_id, region_code",
              )
              .bind(after)
              .all<{ date: string; commodity_id: string; region_code: string; price: number }>(),
          catch: storeError,
        }),
      ),
      Effect.map((out): FreshPayload => {
        const dates: string[] = []
        const prices: Record<string, number> = {}
        for (const row of out.results) {
          if (!dates.includes(row.date)) dates.push(row.date)
          prices[`${row.date}:${row.commodity_id}:${row.region_code}`] = row.price
        }
        const latestDate = dates.length === 0 ? null : (dates[dates.length - 1] ?? null)
        return { latestDate, dates, prices }
      }),
    )

  return Layer.succeed(PriceStore, {
    latestCheckedDate,
    upsertDay,
    recordJob,
    freshSince,
  })
}
