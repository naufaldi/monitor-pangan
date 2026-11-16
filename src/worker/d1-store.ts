import { Clock, Duration, Effect, Layer, Option, Schema } from "effect"
import { COMMODITY_ROWS, REGION_ROWS } from "../data/pihps-catalog.ts"
import { FreshPayloadSchema, type FreshPayload } from "../data/fresh-payload.ts"
import { CivilDateSchema, CommodityIdSchema, RegionCodeSchema } from "../data/price-schema.ts"
import { STATIC_LIVE_THROUGH } from "../data/fresh-prices.ts"
import type { PihpsPriceCell } from "../data/pihps-grid.ts"
import { PriceStore, StoreError, type JobRecord } from "./ingest.ts"
import { CoverageDaySchema, type CoverageDay } from "./ingest-plan.ts"
import { LAPORAN_MIGRATION_SQL } from "./laporan-schema.ts"
import { ARCHIVE_OUTBOX_SQL, capturePublishedDay } from "./archive-outbox.ts"

export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared
  all<T>(): Promise<{ results: T[]; meta?: unknown }>
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
CREATE INDEX IF NOT EXISTS prices_daily_trend ON prices_daily (commodity_id, source_id, level, date);
CREATE INDEX IF NOT EXISTS job_runs_health_attempt ON job_runs (source_id, COALESCE(julianday(started_at), 1e99) DESC, id DESC);
CREATE INDEX IF NOT EXISTS job_runs_health_success ON job_runs (source_id, status, COALESCE(julianday(started_at), 1e99) DESC, id DESC);
INSERT OR IGNORE INTO commodities (id, name, unit) VALUES
${COMMODITY_ROWS.map(([id, name, unit]) => `(${sqlString(id)}, ${sqlString(name)}, ${sqlString(unit)})`).join(",\n")};
INSERT OR IGNORE INTO regions (code, name, level) VALUES
${REGION_ROWS.map(([code, name]) => `(${sqlString(code)}, ${sqlString(name)}, 'province')`).join(",\n")};
${LAPORAN_MIGRATION_SQL};
${ARCHIVE_OUTBOX_SQL}
`

const storeError = (cause: unknown) => new StoreError({ message: String(cause) })

/** Split the schema script into single statements. D1 `exec` of the whole script reports incomplete input. */
export const migrationStatements = (sql: string = MIGRATE_SQL): readonly string[] =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)

const migrated = new WeakMap<D1Database, Promise<void>>()

/** CREATE IF NOT EXISTS does not add columns to reports written by older Workers. */
const ensureReceiptColumn = (db: D1Database): Promise<void> => {
  const hasColumn = () => db.prepare("SELECT name FROM pragma_table_info('laporan_warga') WHERE name = 'receipt_token_hash'")
    .all<{ name: string }>().then((out) => out.results.some((row) => row.name === "receipt_token_hash"))
  return hasColumn().then((exists) => exists ? undefined : db.prepare("ALTER TABLE laporan_warga ADD COLUMN receipt_token_hash TEXT").run().then(
    () => undefined,
    // Another cold isolate may have added the same column. Only that case is safe.
    (cause: unknown) => hasColumn().then((added) => added ? undefined : Promise.reject(cause)),
  ))
}

const migrate = (db: D1Database): Promise<void> => {
  const existing = migrated.get(db)
  if (existing !== undefined) return existing
  const pending = db.batch(migrationStatements().map((statement) => db.prepare(statement))).then(() => ensureReceiptColumn(db)).then(
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

/** Cloudflare's per-colo Cache API, when the runtime provides one. */
export interface FreshEdgeCache {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
}

/** `caches.default` exists in Workers; Node tests and other runtimes have none. */
export const defaultFreshEdgeCache = (): FreshEdgeCache | undefined =>
  (globalThis as { caches?: { default?: FreshEdgeCache } }).caches?.default

/**
 * Age limit of a cached payload, counted from its store read across both tiers (an edge hit keeps
 * its original age in the isolate). Only a write that changes no revision component, such as an
 * operator UPDATE or DELETE, can stay hidden, and for at most this long.
 */
export const FRESH_CACHE_MAX_AGE_MS = 5 * 60 * 1000
/** The edge tier is an optimization; a slow one must not spend the HTML freshness budget. */
export const FRESH_EDGE_BUDGET = Duration.millis(250)

/**
 * The archive epoch identifies the database. Every published price change appends an outbox event
 * (new days and older-day corrections or reconciliation), and every ingestion run, including a
 * failed one that committed some new cells, appends a job row. Supported SQL imports only insert
 * cells (existing official values win), and every insert, including INSERT OR REPLACE, takes a new
 * highest price rowid; a repeated import inserts nothing and keeps the revision. All four values
 * are single rowid seeks, not scans.
 */
export const FRESH_REVISION_SQL = `SELECT epoch, (SELECT COALESCE(MAX(seq), 0) FROM pihps_archive_events) AS seq,
  (SELECT COALESCE(MAX(id), 0) FROM job_runs) AS job, (SELECT COALESCE(MAX(rowid), 0) FROM prices_daily) AS cell
  FROM pihps_archive_epoch WHERE id = 1`
const Count = Schema.Number.pipe(Schema.int(), Schema.nonNegative())
const FreshRevisionRows = Schema.Struct({ results: Schema.Tuple(Schema.Struct({
  epoch: Schema.String.pipe(Schema.pattern(/^[a-f0-9]{32}$/)), seq: Count, job: Count, cell: Count,
})) })
const RowsReadMeta = Schema.Struct({ rows_read: Schema.Number })

const STORED_AT_HEADER = "x-fresh-stored-at"
type FreshMemo = { readonly revision: string; readonly storedAt: number; readonly payload: FreshPayload }
/** One public payload per D1 binding; other `after` values are never memoized. */
const freshMemo = new WeakMap<D1Database, FreshMemo>()

/** D1 binding for the monitor-pangan database. */
export const d1PriceStoreLayer = (db: D1Database, edgeCache: FreshEdgeCache | undefined = undefined) => {
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
    INSERT INTO prices_daily (date, commodity_id, region_code, level, price, source_id, raw_ref)
    SELECT json_extract(value, '$.date'), json_extract(value, '$.commodityId'),
      json_extract(value, '$.regionCode'), 'eceran', json_extract(value, '$.price'), 'pihps',
      'pihps-grid:' || json_extract(value, '$.date') || ':' || json_extract(value, '$.regionCode')
    FROM json_each(?) WHERE true
    ON CONFLICT (date, commodity_id, region_code, level) ${replace ? "DO UPDATE SET price = excluded.price, source_id = excluded.source_id, raw_ref = excluded.raw_ref" : "DO NOTHING"}
  `).bind(JSON.stringify(rows))
  const marker = (date: string, status: CoverageDay["status"], checkedAt: string) => db.prepare(`
    INSERT INTO source_days (date, source_id, status, checked_at) VALUES (?, 'pihps', ?, ?)
    ON CONFLICT (date, source_id) DO UPDATE SET
      status = CASE WHEN source_days.status = 'live' THEN 'live' ELSE excluded.status END,
      checked_at = excluded.checked_at
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
          ? db.batch([insertPrices(rows, true), marker(date, status, checkedAt), capturePublishedDay(db, date, checkedAt)])
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

  const readFresh = (after: string) =>
    ensure.pipe(
      Effect.andThen(() =>
        Effect.tryPromise({
          try: () =>
            db
              .prepare(
                "SELECT date, commodity_id, region_code, price FROM prices_daily WHERE source_id = 'pihps' AND level = 'eceran' AND price IS NOT NULL AND date > ? ORDER BY date, commodity_id, region_code",
              )
              .bind(after)
              .all<unknown>(),
          catch: storeError,
        }),
      ),
      Effect.tap((out) => Option.match(Schema.decodeUnknownOption(RowsReadMeta)(out.meta), {
        onNone: () => Effect.void,
        onSome: (meta) => Effect.logInfo({ event: "pihps_fresh_read", rowsRead: meta.rows_read }),
      })),
      Effect.flatMap(Schema.decodeUnknown(Schema.Struct({ results: Schema.Array(Schema.Struct({
        date: CivilDateSchema, commodity_id: CommodityIdSchema, region_code: RegionCodeSchema,
        price: Schema.Number.pipe(Schema.finite(), Schema.positive()),
      })) }))),
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
      Effect.flatMap(Schema.decodeUnknown(FreshPayloadSchema)),
      Effect.mapError(storeError),
    )

  const freshRevision = ensure.pipe(
    Effect.andThen(() => Effect.tryPromise({ try: () => db.prepare(FRESH_REVISION_SQL).all<unknown>(), catch: storeError })),
    Effect.flatMap(Schema.decodeUnknown(FreshRevisionRows)),
    Effect.map(({ results: [row] }) => `${row.epoch}/${row.seq}/${row.job}/${row.cell}`),
    Effect.mapError(storeError),
  )

  // Cache failures and slow cache calls only cost a store read; they never fail or alter the response.
  const edgeKey = (revision: string) => `https://pihps-fresh.monitor-pangan.internal/v2/${revision}?after=${STATIC_LIVE_THROUGH}`
  const StoredAt = Schema.NumberFromString.pipe(Schema.int(), Schema.nonNegative())
  const edgeGet = (revision: string): Effect.Effect<Option.Option<Omit<FreshMemo, "revision">>> => edgeCache === undefined ? Effect.succeedNone : Effect.tryPromise(() =>
    edgeCache.match(edgeKey(revision)).then((response) => response === undefined ? undefined
      : response.text().then((text) => ({ text, storedAt: response.headers.get(STORED_AT_HEADER) })))).pipe(
    Effect.timeout(FRESH_EDGE_BUDGET),
    Effect.flatMap((hit) => hit === undefined ? Effect.succeedNone : Effect.all({
      storedAt: Schema.decodeUnknown(StoredAt)(hit.storedAt),
      payload: Schema.decodeUnknown(Schema.parseJson(FreshPayloadSchema))(hit.text),
    }).pipe(Effect.map(Option.some))),
    Effect.orElseSucceed(() => Option.none()),
  )
  const edgePut = (revision: string, memo: FreshMemo) => edgeCache === undefined ? Effect.void : Effect.tryPromise(() =>
    edgeCache.put(edgeKey(revision), new Response(JSON.stringify(memo.payload), { headers: {
      "content-type": "application/json", "cache-control": `public, max-age=${FRESH_CACHE_MAX_AGE_MS / 1000}`,
      [STORED_AT_HEADER]: String(memo.storedAt),
    } }))).pipe(Effect.timeout(FRESH_EDGE_BUDGET), Effect.ignore)

  /**
   * The public payload is shared by every HTML shell and the client API. The revision and the clock
   * are both read before the rows, so a payload is never stored under a newer revision or a later
   * time than the data it saw.
   */
  const cachedFresh = Effect.gen(function* () {
    const revision = yield* Effect.option(freshRevision)
    if (Option.isNone(revision)) return yield* readFresh(STATIC_LIVE_THROUGH)
    const now = yield* Clock.currentTimeMillis
    const fresh = (memo: { readonly storedAt: number } | undefined) => memo !== undefined && now - memo.storedAt < FRESH_CACHE_MAX_AGE_MS
    const memo = freshMemo.get(db)
    if (memo?.revision === revision.value && fresh(memo)) return memo.payload
    const edge = yield* edgeGet(revision.value)
    if (Option.isSome(edge) && fresh(edge.value)) {
      freshMemo.set(db, { revision: revision.value, storedAt: Math.min(edge.value.storedAt, now), payload: edge.value.payload })
      return edge.value.payload
    }
    const read: FreshMemo = { revision: revision.value, storedAt: now, payload: yield* readFresh(STATIC_LIVE_THROUGH) }
    freshMemo.set(db, read)
    yield* edgePut(revision.value, read)
    return read.payload
  })

  const freshSince = (after: string) => after === STATIC_LIVE_THROUGH ? cachedFresh : readFresh(after)

  return Layer.succeed(PriceStore, {
    coverageSince,
    upsertDay,
    recordJob,
    freshSince,
  })
}
