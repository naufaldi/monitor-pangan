import { Data, DateTime, Effect, Schema } from 'effect'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ArchiveEpochSchema, ArchiveSequenceSchema, ArchiveEventSchema, CAPTURE_ARCHIVE_DAY_SQL } from '../src/worker/archive-outbox.ts'
import { CivilDateSchema } from '../src/data/price-schema.ts'
import { addIsoDays } from '../src/lib/civil-date.ts'
import { readHistory, publishHistory } from './pihps-history-files.mjs'
import { archiveFiles, sha256 } from './pihps-history.mjs'
import { mergeArchiveEvents, updateArchiveFiles } from './pihps-history-updates.mjs'
import { io } from './pihps-scrape.mjs'

export class ArchiveSyncError extends Data.TaggedError('ArchiveSyncError') {}
const fail = (category) => Effect.fail(new ArchiveSyncError({ category, message: category }))
const MAX_BYTES = 20 * 1024 * 1024
const WatermarkSchema = Schema.Number.pipe(Schema.int(), Schema.between(0, Number.MAX_SAFE_INTEGER))
export const sqliteQuery = (db) => (sql, params = []) => Effect.try({
  try: () => db.prepare(sql).all(...params), catch: () => new ArchiveSyncError({ category: 'database', message: 'local database query failed' }),
})

/** Credentials stay in the runner. All callers use fixed, parameterized SQL. */
export const cloudflareQuery = (config) => Effect.gen(function* () {
  const account = yield* Schema.decodeUnknown(Schema.String.pipe(Schema.pattern(/^[a-f0-9]{32}$/)))(config.account)
  const database = yield* Schema.decodeUnknown(Schema.Literal('2bfc02d3-5eaf-4c7c-999b-e8e77544be21'))(config.database)
  if (!config.token) return yield* fail('missing_credentials')
  return (sql, params = []) => Effect.gen(function* () {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = yield* Effect.tryPromise({
        try: () => (config.fetcher ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
          method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000),
        }), catch: () => new ArchiveSyncError({ category: 'transport', message: 'D1 transport failed' }),
      }).pipe(Effect.either)
      if (response._tag === 'Left' || response.right.status === 429 || response.right.status >= 500) {
        if (attempt < 2) { yield* Effect.sleep(250 * (attempt + 1)); continue }
        return yield* fail('transport')
      }
      if (!response.right.ok) return yield* fail('authorization_or_api')
      const text = yield* Effect.tryPromise({ try: () => response.right.text(), catch: () => new ArchiveSyncError({ category: 'transport', message: 'D1 response failed' }) })
      if (Buffer.byteLength(text) > MAX_BYTES) return yield* fail('response_limit')
      const body = yield* Schema.decodeUnknown(Schema.parseJson(Schema.Struct({ success: Schema.Literal(true),
        result: Schema.Array(Schema.Struct({ success: Schema.Literal(true), results: Schema.Array(Schema.Unknown) })).pipe(Schema.itemsCount(1)),
      })))(text).pipe(Effect.mapError(() => new ArchiveSyncError({ category: 'api_response', message: 'invalid D1 response' })))
      return body.result[0].results
    }
    return yield* fail('transport')
  })
})

export const readArchiveHead = (query) => Effect.gen(function* () {
  const rows = yield* query('SELECT epoch, (SELECT COALESCE(MAX(seq), 0) FROM pihps_archive_events) AS sequence FROM pihps_archive_epoch WHERE id=1')
  const heads = yield* Schema.decodeUnknown(Schema.Array(Schema.Struct({ epoch: ArchiveEpochSchema, sequence: WatermarkSchema })).pipe(Schema.itemsCount(1)))(rows)
  return heads[0]
})

const EventRows = Schema.Array(Schema.Struct({ epoch: ArchiveEpochSchema, seq: ArchiveSequenceSchema, date: CivilDateSchema,
  kind: Schema.Literal('daily_ingest', 'd1_reconciliation'), captured_at: Schema.String,
  source_check_json: Schema.String, observations_json: Schema.String }))
const parseJson = Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))
export const readArchiveEvents = ({ query, epoch, after, through, limit }) => Effect.gen(function* () {
  const rows = yield* query('SELECT seq, date, kind, captured_at, source_check_json, observations_json, epoch FROM pihps_archive_events CROSS JOIN pihps_archive_epoch WHERE pihps_archive_epoch.id=1 AND seq > ? AND seq <= ? ORDER BY seq LIMIT ?', [after, through, limit])
    .pipe(Effect.flatMap(Schema.decodeUnknown(EventRows)))
  let previous = after
  return yield* Effect.forEach(rows, (row) => Effect.gen(function* () {
    if (row.epoch !== epoch) return yield* fail('epoch_mismatch')
    if (row.seq <= previous || row.seq > through) return yield* fail('event_order')
    previous = row.seq
    return yield* Schema.decodeUnknown(ArchiveEventSchema, { onExcessProperty: 'error' })({ schemaVersion: 1, epoch, sequence: row.seq,
      kind: row.kind, date: row.date, capturedAt: row.captured_at,
      sourceCheck: yield* parseJson(row.source_check_json), observations: yield* parseJson(row.observations_json) })
  }))
})

export const syncArchive = ({ directory = 'data/history/pihps', query, maxEvents = 100, dryRun = false }) => Effect.gen(function* () {
  yield* Schema.decodeUnknown(Schema.Number.pipe(Schema.int(), Schema.between(1, 100)))(maxEvents)
  const archive = yield* readHistory(directory), head = yield* readArchiveHead(query)
  const checkpoint = archive.updates.manifest?.throughSequence ?? 0
  if (archive.updates.manifest?.epoch != null && archive.updates.manifest.epoch !== head.epoch) return yield* fail('epoch_mismatch')
  if (checkpoint > head.sequence) return yield* fail('checkpoint_ahead')
  let after = checkpoint, bytes = 0, stop = false
  const incoming = []
  while (after < head.sequence && incoming.length < maxEvents && !stop) {
    const page = yield* readArchiveEvents({ query, epoch: head.epoch, after, through: head.sequence, limit: Math.min(25, maxEvents - incoming.length) })
    if (page.length === 0) return yield* fail('missing_events')
    for (const event of page) {
      const size = Buffer.byteLength(JSON.stringify(event))
      if (bytes + size > MAX_BYTES) {
        if (incoming.length === 0) return yield* fail('event_limit')
        stop = true; break
      }
      incoming.push(event); bytes += size; after = event.sequence
    }
  }
  const remaining = yield* query('SELECT COUNT(*) AS count FROM pihps_archive_events WHERE seq > ?', [after]).pipe(
    Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ count: WatermarkSchema })).pipe(Schema.itemsCount(1)))))
  const finalHead = yield* readArchiveHead(query)
  if (finalHead.epoch !== head.epoch) return yield* fail('epoch_mismatch')
  if (finalHead.sequence < after) return yield* fail('checkpoint_ahead')
  if (incoming.length === 0) return { outcome: 'unchanged', epoch: head.epoch, throughSequence: after, remainingEvents: remaining[0].count, events: 0 }
  const events = yield* Effect.try({ try: () => mergeArchiveEvents(archive.updates.events, incoming), catch: () => new ArchiveSyncError({ category: 'conflicting_event', message: 'conflicting event' }) })
  const files = archiveFiles(archive.years)
  for (const [name, text] of yield* updateArchiveFiles(events, sha256(files.get('manifest.json')))) files.set(name, text)
  const readme = yield* io(() => readFile(join(directory, 'README.md'), 'utf8')).pipe(Effect.catchIf((e) => e.message.includes('ENOENT'), () => Effect.succeed(null)))
  if (readme !== null) files.set('README.md', readme)
  if (!dryRun) yield* publishHistory(directory, files, (stage) => Effect.gen(function* () {
    // Under the publisher lock, reject a stale reader rather than overwrite another export.
    const current = yield* readHistory(directory)
    if (JSON.stringify(current.updates.manifest) !== JSON.stringify(archive.updates.manifest)) return yield* fail('concurrent_export')
    return yield* readHistory(stage)
  }))
  return { outcome: dryRun ? 'dry_run' : remaining[0].count > 0 ? 'bounded' : 'updated', epoch: head.epoch,
    fromSequence: checkpoint, throughSequence: after, remainingEvents: remaining[0].count, events: incoming.length,
    dates: [...new Set(incoming.map((event) => event.date))].sort(), bytes }
})

/** Explicit one-time or correction reconciliation; never modifies prices or source completion. */
export const reconcileRange = ({ query, from, to, apply = false }) => Effect.gen(function* () {
  yield* Schema.decodeUnknown(CivilDateSchema)(from)
  yield* Schema.decodeUnknown(CivilDateSchema)(to)
  if (from > to || to > addIsoDays(from, 30)) return yield* fail('range_limit_31_days')
  yield* readArchiveHead(query)
  const dates = yield* query("SELECT DISTINCT date FROM prices_daily WHERE source_id='pihps' AND level='eceran' AND price IS NOT NULL AND date >= ? AND date <= ? ORDER BY date", [from, to])
    .pipe(Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ date: CivilDateSchema })).pipe(Schema.maxItems(31)))))
  const checkedAt = DateTime.formatIso(yield* DateTime.now)
  if (apply) for (const { date } of dates) yield* query(CAPTURE_ARCHIVE_DAY_SQL, [JSON.stringify({ date, checkedAt, kind: 'd1_reconciliation' })])
  return { applied: apply, from, to, dates: dates.length, sourceCompletion: 'unknown' }
})
