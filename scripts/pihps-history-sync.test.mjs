import { assert, it } from '@effect/vitest'
import { Effect, Layer, TestClock } from 'effect'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sqliteFixture } from '../src/worker/sqlite-test.ts'
import { d1PriceStoreLayer } from '../src/worker/d1-store.ts'
import { PriceStore, PihpsSource } from '../src/worker/ingest.ts'
import { handleScheduled } from '../src/worker/index.ts'
import { tradingDaysFromThrough } from '../src/lib/civil-date.ts'
import { syncArchive, sqliteQuery, reconcileRange, cloudflareQuery } from './pihps-history-sync.mjs'
import { readHistory } from './pihps-history-files.mjs'

const temp = (use) => Effect.acquireUseRelease(Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-sync-'))),
  (root) => Effect.promise(() => cp('data/history/pihps', join(root, 'archive'), { recursive: true })).pipe(Effect.andThen(use(root))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })))
const publish = (db, date, price) => Effect.gen(function* () {
  const store = yield* PriceStore
  yield* store.upsertDay(date, 'live', [{ date, commodityId: 'beras', regionCode: '31', price }], '2026-10-19T10:15:00Z')
}).pipe(Effect.provide(d1PriceStoreLayer(db)))

it.effect('bounded export resumes, detects an older correction and unchanged replay changes no bytes', () => temp((root) => Effect.gen(function* () {
  const { db, sqlite } = yield* sqliteFixture
  const directory = join(root, 'archive'), query = sqliteQuery(sqlite)
  yield* publish(db, '2026-10-19', 16000)
  yield* publish(db, '2018-10-09', 14000)
  assert.strictEqual((yield* syncArchive({ directory, query, maxEvents: 1 })).remainingEvents, 1)
  assert.strictEqual((yield* syncArchive({ directory, query, maxEvents: 1 })).remainingEvents, 0)
  const before = yield* Effect.promise(() => readFile(join(directory, 'updates/manifest.json'), 'utf8'))
  assert.strictEqual((yield* syncArchive({ directory, query })).outcome, 'unchanged')
  assert.strictEqual(yield* Effect.promise(() => readFile(join(directory, 'updates/manifest.json'), 'utf8')), before)
  assert.strictEqual((yield* readHistory(directory)).updates.events.length, 2)
})), 20000)

it.effect('export failure retains the archive and retry does not change prices or ingestion jobs', () => temp((root) => Effect.gen(function* () {
  const { db, sqlite } = yield* sqliteFixture
  yield* publish(db, '2026-10-19', 16000)
  const directory = join(root, 'archive'), before = sqlite.prepare('SELECT * FROM prices_daily').all()
  const failed = yield* Effect.either(syncArchive({ directory, query: () => Effect.fail(new Error('offline')) }))
  assert.strictEqual(failed._tag, 'Left')
  assert.strictEqual((yield* readHistory(directory)).updates.events.length, 0)
  yield* syncArchive({ directory, query: sqliteQuery(sqlite) })
  assert.deepStrictEqual(sqlite.prepare('SELECT * FROM prices_daily').all(), before)
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM job_runs').get().n, 0)
})), 15000)

it.effect('bounded reconciliation captures preexisting data without inventing source completion', () => Effect.gen(function* () {
  const { sqlite, price } = yield* sqliteFixture
  yield* price('2026-09-16', '31', 15000)
  const query = sqliteQuery(sqlite)
  assert.strictEqual((yield* reconcileRange({ query, from: '2026-09-16', to: '2026-09-16' })).applied, false)
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM pihps_archive_events').get().n, 0)
  yield* reconcileRange({ query, from: '2026-09-16', to: '2026-09-16', apply: true })
  yield* reconcileRange({ query, from: '2026-09-16', to: '2026-09-16', apply: true })
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM pihps_archive_events').get().n, 1)
  assert.strictEqual(sqlite.prepare('SELECT source_check_json FROM pihps_archive_events').get().source_check_json, 'null')
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM source_days').get().n, 0)
}))

it.effect('Cloudflare errors are bounded, sanitized, and never accepted as empty exports', () => Effect.gen(function* () {
  const query = yield* cloudflareQuery({ account: 'a'.repeat(32), database: '2bfc02d3-5eaf-4c7c-999b-e8e77544be21', token: 'private',
    fetcher: () => Promise.resolve(new Response('{"success":false,"errors":[{"message":"private"}]}', { status: 403 })) })
  const failure = yield* Effect.flip(query('SELECT 1', []))
  assert.ok(!String(failure).includes('private'))
}))

it.effect('scheduled delayed publication flows through D1 and archive; export-only retry makes no source requests', () => temp((root) => Effect.gen(function* () {
  yield* TestClock.setTime(1792401300000)
  const { db, sqlite, coverage } = yield* sqliteFixture
  for (const date of tradingDaysFromThrough('2026-09-17', '2026-10-16')) yield* coverage(date, 'empty')
  let ready = false, calls = 0
  const source = Layer.succeed(PihpsSource, { fetchGrid: () => Effect.sync(() => {
    calls++
    return { data: ready ? [{ name: 'Beras', level: 1, '19/10/2026': '16,000' }] : [] }
  }) })
  const scheduled = handleScheduled().pipe(Effect.provide(Layer.mergeAll(d1PriceStoreLayer(db), source)))
  yield* scheduled
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM pihps_archive_events').get().n, 0)
  ready = true
  yield* TestClock.setTime(1792404900000)
  yield* scheduled
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM prices_daily').get().n, 34)
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM pihps_archive_events').get().n, 1)
  const directory = join(root, 'archive')
  assert.strictEqual((yield* Effect.either(syncArchive({ directory, query: () => Effect.fail(new Error('export offline')) })))._tag, 'Left')
  yield* syncArchive({ directory, query: sqliteQuery(sqlite) })
  yield* syncArchive({ directory, query: sqliteQuery(sqlite) })
  const archived = yield* readHistory(directory)
  assert.strictEqual(archived.updates.events[0].observations.length, 34)
  assert.strictEqual(calls, 68)
  assert.strictEqual(sqlite.prepare('SELECT COUNT(*) AS n FROM job_runs').get().n, 2)
})), 20000)

it.effect('writes during export wait for the next watermark and overlapping exporters converge', () => temp((root) => Effect.gen(function* () {
  const { db, sqlite } = yield* sqliteFixture
  yield* publish(db, '2026-10-19', 16000)
  const query = sqliteQuery(sqlite), directory = join(root, 'archive')
  let corrected = false
  const concurrentQuery = (sql, params) => query(sql, params).pipe(Effect.tap(() => {
    if (!corrected && sql.startsWith('SELECT seq,')) {
      corrected = true
      return publish(db, '2026-10-19', 18000)
    }
    return Effect.void
  }))
  assert.strictEqual((yield* syncArchive({ directory, query: concurrentQuery })).remainingEvents, 1)
  assert.strictEqual((yield* readHistory(directory)).updates.events[0].observations[0][2], 16000)
  const outcomes = yield* Effect.all([1, 100].map((maxEvents) => syncArchive({ directory, query, maxEvents }).pipe(Effect.either)), { concurrency: 2 })
  assert.ok(outcomes.some((outcome) => outcome._tag === 'Right'))
  yield* syncArchive({ directory, query })
  const final = yield* readHistory(directory)
  assert.deepStrictEqual(final.updates.events.map((event) => event.sequence), [1, 2])
  assert.strictEqual(final.updates.events.at(-1).observations[0][2], 18000)
})), 20000)

it.effect('an epoch reset between head and page reads aborts without publishing mislabeled observations', () => temp((root) => Effect.gen(function* () {
  const { db, sqlite } = yield* sqliteFixture
  yield* publish(db, '2026-10-19', 16000)
  const query = sqliteQuery(sqlite)
  let switched = false
  const resettingQuery = (sql, params) => query(sql, params).pipe(Effect.tap(() => Effect.sync(() => {
    if (!switched && sql.includes('FROM pihps_archive_epoch')) {
      switched = true
      sqlite.prepare('UPDATE pihps_archive_epoch SET epoch=?').run('b'.repeat(32))
    }
  })))
  const directory = join(root, 'archive')
  assert.strictEqual((yield* Effect.either(syncArchive({ directory, query: resettingQuery })))._tag, 'Left')
  assert.strictEqual((yield* readHistory(directory)).updates.events.length, 0)
})), 15000)
