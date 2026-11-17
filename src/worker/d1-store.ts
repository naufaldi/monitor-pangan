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

const FRESH_STATE_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS pihps_fresh_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_revision INTEGER,
  payload TEXT
);
INSERT OR IGNORE INTO pihps_fresh_state (id, epoch, revision) VALUES (1, lower(hex(randomblob(16))), 0);
CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_insert
AFTER INSERT ON prices_daily
WHEN NEW.source_id = 'pihps' AND NEW.level = 'eceran' AND NEW.price IS NOT NULL
BEGIN
  UPDATE pihps_fresh_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_delete
AFTER DELETE ON prices_daily
WHEN OLD.source_id = 'pihps' AND OLD.level = 'eceran' AND OLD.price IS NOT NULL
BEGIN
  UPDATE pihps_fresh_state SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_archive
AFTER INSERT ON pihps_archive_events
BEGIN
  UPDATE pihps_fresh_state SET revision = revision + 1 WHERE id = 1;
END;
`

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
${ARCHIVE_OUTBOX_SQL};
${FRESH_STATE_SQL}
`

const storeError = (cause: unknown) => new StoreError({ message: String(cause) })

const isSqlWord = (sql: string, index: number, word: string) => {
  if (sql.slice(index, index + word.length).toUpperCase() !== word) return false
  const before = index === 0 ? " " : sql[index - 1] ?? " "
  const after = sql[index + word.length] ?? " "
  return /\W/.test(before) && /\W/.test(after)
}

/** Split the schema script into single statements. Semicolons inside a trigger body stay put. D1 `exec` of the whole script reports incomplete input. */
export const migrationStatements = (sql: string = MIGRATE_SQL): readonly string[] => {
  const statements: string[] = []
  let current = ""
  let body = 0
  for (let i = 0; i < sql.length; i++) {
    if (isSqlWord(sql, i, "BEGIN")) {
      body++
      current += sql.slice(i, i + 5)
      i += 4
      continue
    }
    if (body > 0 && isSqlWord(sql, i, "END")) {
      body--
      current += sql.slice(i, i + 3)
      i += 2
      continue
    }
    const char = sql[i] ?? ""
    if (char === ";" && body === 0) {
      const statement = current.trim()
      if (statement.length > 0) statements.push(statement)
      current = ""
      continue
    }
    current += char
  }
  const tail = current.trim()
  if (tail.length > 0) statements.push(tail)
  return statements
}

/**
 * Checked-in schema generation. Bump when `MIGRATE_SQL` or the receipt-column alter changes.
 * `PRAGMA user_version` is not in D1's pragma allow-list, so the generation lives in one row.
 */
export const SCHEMA_VERSION = 1
export const SCHEMA_VERSION_SQL = "SELECT version FROM schema_version WHERE id = 1"

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

/** Missing on a fresh database and on databases migrated before `schema_version` existed. */
const readSchemaVersion = async (db: D1Database): Promise<number> => {
  try {
    const out = await db.prepare(SCHEMA_VERSION_SQL).all<{ version: number }>()
    const version = out.results[0]?.version
    return typeof version === "number" && Number.isInteger(version) && version >= 0 ? version : 0
  } catch {
    return 0
  }
}

const stampSchemaVersion = (db: D1Database): Promise<void> =>
  db.prepare(
    "INSERT INTO schema_version (id, version) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET version = excluded.version",
  ).bind(SCHEMA_VERSION).run().then(() => undefined)

const migrate = (db: D1Database): Promise<void> => {
  const existing = migrated.get(db)
  if (existing !== undefined) return existing
  const pending = readSchemaVersion(db).then((version) => version === SCHEMA_VERSION
    ? undefined
    : db.batch(migrationStatements().map((statement) => db.prepare(statement))).then(() => ensureReceiptColumn(db)).then(() => stampSchemaVersion(db)),
  ).then(
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
 * Age limit of the isolate memo and the edge entry, counted from the read that stored them (an edge
 * hit keeps its original age). A price insert, a priced-row delete, or a published archive event
 * bumps `pihps_fresh_state.revision` in the same transaction and invalidates both at once. After the
 * age elapses, the next read loads that revision's snapshot row. An in-place UPDATE that publishes
 * no archive event does not bump the revision, so it stays out of the public payload until a later
 * bump or a missing snapshot.
 */
export const FRESH_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** The edge tier is an optimization; a slow one must not spend the HTML freshness budget. */
export const FRESH_EDGE_BUDGET = Duration.millis(250)

/**
 * One primary-key lookup. Triggers bump `revision` when a priced retail row is inserted or deleted,
 * and when a published archive event records a change (including an in-place correction). A repeated
 * import inserts nothing and keeps the revision. Job rows alone do not: a run that wrote no cells
 * has nothing new to show.
 */
export const FRESH_REVISION_SQL = "SELECT epoch, revision FROM pihps_fresh_state WHERE id = 1"
/** Payload for the revision observed by the caller. A stale snapshot matches zero rows. */
export const FRESH_PAYLOAD_SQL = "SELECT payload FROM pihps_fresh_state WHERE id = 1 AND revision = ? AND payload_revision = revision AND payload IS NOT NULL"
const Count = Schema.Number.pipe(Schema.int(), Schema.nonNegative())
const FreshRevisionRows = Schema.Struct({ results: Schema.Tuple(Schema.Struct({
  epoch: Schema.String.pipe(Schema.pattern(/^[a-f0-9]{32}$/)),
  revision: Count,
})) })
const FreshReadyRows = Schema.Struct({ results: Schema.Tuple(Schema.Struct({
  revision: Count,
  payload_revision: Schema.NullOr(Count),
  ready: Schema.Literal(0, 1),
})) })
const RunChanges = Schema.Struct({ meta: Schema.Struct({ changes: Schema.Number.pipe(Schema.int(), Schema.nonNegative()) }) })
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
    Effect.map(({ results: [row] }) => row),
    Effect.mapError(storeError),
  )

  // Cache failures and slow cache calls only cost a store read; they never fail or alter the response.
  const edgeKey = (revision: string) => `https://pihps-fresh.monitor-pangan.internal/v3/${revision}?after=${STATIC_LIVE_THROUGH}`
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
      "content-type": "application/json",
      "cache-control": `public, max-age=${FRESH_CACHE_MAX_AGE_MS / 1000}`,
      etag: `"${revision}"`,
      [STORED_AT_HEADER]: String(memo.storedAt),
    } }))).pipe(Effect.timeout(FRESH_EDGE_BUDGET), Effect.ignore)

  const precomputed = (revision: number): Effect.Effect<Option.Option<FreshPayload>> => Effect.tryPromise({
    try: () => db.prepare(FRESH_PAYLOAD_SQL).bind(revision).all<unknown>(),
    catch: storeError,
  }).pipe(
    Effect.flatMap(Schema.decodeUnknown(Schema.Struct({ results: Schema.Array(Schema.Struct({ payload: Schema.String })) }))),
    Effect.flatMap(({ results }) => {
      const row = results[0]
      if (row === undefined) return Effect.succeed(Option.none<FreshPayload>())
      return Schema.decodeUnknown(Schema.parseJson(FreshPayloadSchema))(row.payload).pipe(Effect.map(Option.some))
    }),
    Effect.orElseSucceed(() => Option.none()),
  )

  /** Write the payload for the revision that was read before the scan. A newer revision is left alone. */
  const storeSnapshot = (revision: number, payload: FreshPayload) => Effect.tryPromise({
    try: () => db.prepare(
      "UPDATE pihps_fresh_state SET payload = ?, payload_revision = revision WHERE id = 1 AND revision = ?",
    ).bind(JSON.stringify(payload), revision).run(),
    catch: storeError,
  }).pipe(
    Effect.flatMap(Schema.decodeUnknown(RunChanges)),
    Effect.mapError(storeError),
  )

  const publishFresh = Effect.gen(function* () {
    yield* ensure
    const ready = yield* Effect.tryPromise({
      try: () => db.prepare(
        "SELECT revision, payload_revision, payload IS NOT NULL AS ready FROM pihps_fresh_state WHERE id = 1",
      ).all<unknown>(),
      catch: storeError,
    }).pipe(Effect.flatMap(Schema.decodeUnknown(FreshReadyRows)), Effect.mapError(storeError))
    const state = ready.results[0]
    if (state.ready === 1 && state.payload_revision === state.revision) return
    const payload = yield* readFresh(STATIC_LIVE_THROUGH)
    const written = yield* storeSnapshot(state.revision, payload)
    if (written.meta.changes < 1) return yield* Effect.fail(new StoreError({ message: "fresh snapshot was not stored" }))
  })

  /**
   * The public payload is shared by every HTML shell and the client API. The revision is read
   * before any payload, so a snapshot is never stored under a newer revision than the data it saw.
   * A cache miss reads the precomputed row and scans `prices_daily` only when that row is absent.
   */
  const cachedFresh = Effect.gen(function* () {
    const revision = yield* Effect.option(freshRevision)
    if (Option.isNone(revision)) return yield* readFresh(STATIC_LIVE_THROUGH)
    const key = `${revision.value.epoch}/${revision.value.revision}`
    const now = yield* Clock.currentTimeMillis
    const fresh = (memo: { readonly storedAt: number } | undefined) => memo !== undefined && now - memo.storedAt < FRESH_CACHE_MAX_AGE_MS
    const memo = freshMemo.get(db)
    if (memo?.revision === key && fresh(memo)) return memo.payload
    const edge = yield* edgeGet(key)
    if (Option.isSome(edge) && fresh(edge.value)) {
      freshMemo.set(db, { revision: key, storedAt: Math.min(edge.value.storedAt, now), payload: edge.value.payload })
      return edge.value.payload
    }
    const stored = yield* precomputed(revision.value.revision)
    if (Option.isSome(stored)) {
      const hit: FreshMemo = { revision: key, storedAt: now, payload: stored.value }
      freshMemo.set(db, hit)
      yield* edgePut(key, hit)
      return stored.value
    }
    const payload = yield* readFresh(STATIC_LIVE_THROUGH)
    yield* storeSnapshot(revision.value.revision, payload).pipe(Effect.ignore)
    const read: FreshMemo = { revision: key, storedAt: now, payload }
    freshMemo.set(db, read)
    yield* edgePut(key, read)
    return read.payload
  })

  const freshSince = (after: string) => after === STATIC_LIVE_THROUGH ? cachedFresh : readFresh(after)

  return Layer.succeed(PriceStore, {
    coverageSince,
    upsertDay,
    recordJob,
    publishFresh: () => publishFresh,
    freshSince,
  })
}
