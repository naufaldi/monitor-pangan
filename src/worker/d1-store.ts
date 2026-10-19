import { Effect, Layer, Schema } from "effect"
import { COMMODITY_ROWS, REGION_ROWS } from "../data/pihps-catalog.ts"
import type { FreshPayload } from "../data/fresh-payload.ts"
import type { PihpsPriceCell } from "../data/pihps-grid.ts"
import { PriceStore, StoreError, type JobRecord } from "./ingest.ts"
import { CoverageDaySchema, type CoverageDay } from "./ingest-plan.ts"
import { LAPORAN_MIGRATION_SQL } from "./laporan-schema.ts"

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
INSERT OR IGNORE INTO commodities (id, name, unit) VALUES
${COMMODITY_ROWS.map(([id, name, unit]) => `(${sqlString(id)}, ${sqlString(name)}, ${sqlString(unit)})`).join(",\n")};
INSERT OR IGNORE INTO regions (code, name, level) VALUES
${REGION_ROWS.map(([code, name]) => `(${sqlString(code)}, ${sqlString(name)}, 'province')`).join(",\n")};
${LAPORAN_MIGRATION_SQL}
`

const storeError = (cause: unknown) => new StoreError({ message: String(cause) })

/** Split the schema script into single statements. D1 `exec` of the whole script reports incomplete input. */
export const migrationStatements = (sql: string = MIGRATE_SQL): readonly string[] =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)

const migrated = new WeakMap<D1Database, Promise<void>>()

const migrate = (db: D1Database): Promise<void> => {
  const existing = migrated.get(db)
  if (existing !== undefined) return existing
  const pending = db.batch(migrationStatements().map((statement) => db.prepare(statement))).then(
    () => undefined,
    (cause: unknown) => {
      if (migrated.get(db) === pending) migrated.delete(db)
      throw cause
    },
  )
  migrated.set(db, pending)
  return pending
}

/** Apply the checked-in schema once per D1 binding. */
export const ensureMigrated = (db: D1Database) =>
  Effect.tryPromise({
    try: () => migrate(db),
    catch: storeError,
  })

/** D1 binding for the monitor-pangan database. */
export const d1PriceStoreLayer = (db: D1Database) => {
  const ensure = Effect.tryPromise({
    try: () => migrate(db),
    catch: storeError,
  })

  const coverageSince = (after: string) => ensure.pipe(
    Effect.andThen(() => Effect.tryPromise({
      try: () => db.prepare("SELECT date, status FROM source_days WHERE source_id = 'pihps' AND date > ? ORDER BY date").bind(after).all<unknown>(),
      catch: storeError,
    })),
    Effect.flatMap(Schema.decodeUnknown(Schema.Struct({ results: Schema.Array(CoverageDaySchema) }))),
    Effect.map((out) => out.results),
    Effect.mapError(storeError),
  )

  // JSON input keeps each SQL statement below D1's 100 bound-parameter limit.
  const insertPrices = (rows: readonly PihpsPriceCell[], replace: boolean) => db.prepare(`
    INSERT INTO prices_daily (date, commodity_id, region_code, level, price, source_id)
    SELECT json_extract(value, '$.date'), json_extract(value, '$.commodityId'),
      json_extract(value, '$.regionCode'), 'eceran', json_extract(value, '$.price'), 'pihps'
    FROM json_each(?) WHERE true
    ON CONFLICT (date, commodity_id, region_code, level) ${replace ? "DO UPDATE SET price = excluded.price, source_id = excluded.source_id" : "DO NOTHING"}
  `).bind(JSON.stringify(rows))
  const marker = (date: string, status: CoverageDay["status"], checkedAt: string) => db.prepare(`
    INSERT INTO source_days (date, source_id, status, checked_at) VALUES (?, 'pihps', ?, ?)
    ON CONFLICT (date, source_id) DO UPDATE SET status = excluded.status, checked_at = excluded.checked_at
    WHERE source_days.status != 'live' OR excluded.status = 'live'
  `).bind(date, status, checkedAt)
  const Changes = Schema.Array(Schema.Struct({ meta: Schema.Struct({ changes: Schema.Number.pipe(Schema.int(), Schema.nonNegative()) }) }))

  const upsertDay = (date: string, status: CoverageDay["status"], rows: readonly PihpsPriceCell[], checkedAt: string) => Effect.suspend(() => {
    let confirmed = 0
    return Effect.gen(function* () {
      yield* ensure
      // First commit only new cells. Existing good cells cannot change on a failed refresh.
      for (let i = 0; i < rows.length; i += 40) {
        const result = yield* Effect.tryPromise({
          try: () => db.batch([insertPrices(rows.slice(i, i + 40), false)]),
          catch: storeError,
        }).pipe(Effect.flatMap(Schema.decodeUnknown(Changes)), Effect.mapError(storeError))
        confirmed += result.reduce((count, statement) => count + statement.meta.changes, 0)
      }
      // D1 batches are transactional: refresh existing cells and publish completion together.
      yield* Effect.tryPromise({
        try: () => rows.length > 0 && status === "live"
          ? db.batch([insertPrices(rows, true), marker(date, status, checkedAt)])
          : marker(date, status, checkedAt).run(),
        catch: storeError,
      })
      return rows.length
    }).pipe(Effect.mapError((error) => new StoreError({ message: error.message, rowsUpserted: confirmed })))
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
    coverageSince,
    upsertDay,
    recordJob,
    freshSince,
  })
}
