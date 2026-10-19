import { assert, it } from '@effect/vitest'
import { DateTime, Effect, TestClock } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { planImport, derivedObservations, snapshotObservations, rawObservations } from './price-import.mjs'
import { SCOPES } from './pihps-scrape.mjs'

const row = { date: '2018-10-09', commodity_id: 'beras', region_code: '31', level: 'eceran', price: 13200, source_id: 'pihps', raw_ref: 'git:abc:public/series/2018.json' }
const emptyRaw = (date, fetchedAt) => ({ date, fetchedAt, source: 'pihps', rows: SCOPES.map((s) => ({ ...s, prices: {}, status: 'source-empty' })) })
it.effect('repeat import is idempotent, preserves newer data and never invents coverage', () => Effect.sync(() => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec("INSERT INTO commodities VALUES ('beras','Beras','kg'); INSERT INTO regions VALUES ('31','Jakarta','province'); INSERT INTO prices_daily VALUES ('2026-10-19','beras','31','eceran',16000,'pihps',NULL)")
  const first = planImport({ from: '2018-10-09', to: '2018-10-09', observations: [row], existing: db.prepare('SELECT * FROM prices_daily').all() })
  assert.strictEqual(first.report.inserts, 1)
  db.exec(first.sql)
  const repeat = planImport({ from: '2018-10-09', to: '2018-10-09', observations: [row], existing: db.prepare('SELECT * FROM prices_daily').all() })
  const beforeRepeat = db.prepare('SELECT total_changes() AS n').get().n
  db.exec(repeat.sql)
  assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n, beforeRepeat)
  assert.strictEqual(repeat.report.inserts, 0)
  assert.strictEqual(repeat.report.unchanged, 1)
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM prices_daily').get().n, 2)
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM source_days').get().n, 0)
  db.close()
}))
it.effect('dry-run rejects non-PIHPS conflicts and generated SQL guards against later conflicts', () => Effect.sync(() => {
  assert.throws(() => planImport({ from: row.date, to: row.date, observations: [row], existing: [{ ...row, source_id: 'other' }] }), /conflict/i)
  const plan = planImport({ from: row.date, to: row.date, observations: [row], existing: [] })
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec("INSERT INTO commodities VALUES ('beras','Beras','kg'); INSERT INTO regions VALUES ('31','Jakarta','province'); INSERT INTO prices_daily VALUES ('2018-10-09','beras','31','eceran',12000,'other',NULL)")
  assert.throws(() => db.exec(plan.sql), /conflict|malformed JSON/i)
  assert.strictEqual(db.prepare('SELECT source_id FROM prices_daily').get().source_id, 'other')
  db.close()
}))
it.effect('snapshot importer rejects unofficial cells and requires valid explicit range', () => Effect.sync(() => {
  assert.throws(() => snapshotObservations({ rows: [{ ...row, source_id: 'example' }] }), /pihps/i)
  assert.throws(() => planImport({ observations: [row], existing: [] }), /range/i)
  assert.throws(() => planImport({ from: '2025-02-30', to: '2025-03-01', observations: [], existing: [] }), /range/i)
}))
it.effect('derived recovery ignores national columns and keeps provincial observations exactly', () => Effect.gen(function* () {
  const { COMMODITY_ROWS, REGION_ROWS } = yield* Effect.promise(() => import('../src/data/pihps-catalog.ts'))
  const values = Object.fromEntries(COMMODITY_ROWS.map(([id]) => [id, Object.fromEntries([...REGION_ROWS.map(([code]) => [code, [code === '31' ? 13200 : null]]), ['nasional', [11707]]])]))
  const out = yield* derivedObservations({ year: '2018', dates: ['2018-10-09'], values }, 'git:abc:public/series/2018.json')
  assert.strictEqual(out.length, 10)
  assert.strictEqual(out[0].price, 13200)
  assert.ok(out.every((r) => r.region_code === '31'))
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec(planImport({ from: row.date, to: row.date, observations: out, existing: [] }).sql)
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM source_days').get().n, 0)
  db.close()
}))
it.effect('zero-cell checks remain pending until the survey date has passed in Jakarta', () => Effect.gen(function* () {
  for (const fetchedAt of ['2026-10-19T04:00:00Z', '2026-10-18T17:00:00.000Z', '2026-10-18T16:59:59Z']) {
    const date = '2026-10-19'
    const raw = yield* rawObservations(emptyRaw(date, fetchedAt), 'raw')
    const db = new DatabaseSync(':memory:')
    db.exec(readFileSync('db/schema.sql', 'utf8'))
    const plan = planImport({ from: date, to: date, observations: raw.observations, existing: [], coverage: [raw.coverage] })
    db.exec(plan.sql)
    assert.strictEqual(db.prepare('SELECT status FROM source_days').get().status, 'pending')
    const repeat = planImport({ from: date, to: date, observations: [], existing: [], coverage: [raw.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
    const changes = db.prepare('SELECT total_changes() AS n').get().n
    db.exec(repeat.sql)
    assert.strictEqual(repeat.report.coverageChanges, 0)
    assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n, changes)
    db.close()
  }
}))
it.effect('a successful later source check can establish empty after a pending day', () => Effect.gen(function* () {
  const date = '2026-10-19'
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  const sameDay = yield* rawObservations(emptyRaw(date, '2026-10-19T04:00:00Z'), 'raw')
  db.exec(planImport({ from: date, to: date, observations: [], existing: [], coverage: [sameDay.coverage] }).sql)
  const later = yield* rawObservations(emptyRaw(date, '2026-10-19T17:00:00Z'), 'raw')
  const plan = planImport({ from: date, to: date, observations: [], existing: [], coverage: [later.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
  assert.strictEqual(plan.report.coverageChanges, 1)
  db.exec(plan.sql)
  assert.strictEqual(db.prepare('SELECT status FROM source_days').get().status, 'empty')
  const repeat = planImport({ from: date, to: date, observations: [], existing: [], coverage: [later.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
  const changes = db.prepare('SELECT total_changes() AS n').get().n
  db.exec(repeat.sql)
  assert.strictEqual(repeat.report.coverageChanges, 0)
  assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n, changes)
  db.close()
}))
it.effect('older pending evidence cannot downgrade confirmed empty or rewind its check time', () => Effect.gen(function* () {
  const date = '2026-10-19', checkedAt = '2026-10-19T17:00:00Z'
  const pending = yield* rawObservations(emptyRaw(date, '2026-10-19T04:00:00Z'), 'raw')
  const empty = yield* rawObservations(emptyRaw(date, checkedAt), 'raw')
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec(planImport({ from: date, to: date, observations: [], existing: [], coverage: [empty.coverage] }).sql)
  for (let i = 0; i < 2; i++) {
    const plan = planImport({ from: date, to: date, observations: [], existing: [], coverage: [pending.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
    const before = db.prepare('SELECT total_changes() AS n').get().n
    db.exec(plan.sql)
    assert.strictEqual(plan.report.coverageChanges, 0)
    assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n - before, 0)
    assert.deepStrictEqual({ ...db.prepare('SELECT status,checked_at FROM source_days').get() }, { status: 'empty', checked_at: checkedAt })
  }
  db.close()
}))
it.effect('coverage replay compares instants rather than mixed whole-second and millisecond strings', () => Effect.gen(function* () {
  const date = '2026-10-19'
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec("INSERT INTO source_days VALUES ('2026-10-19','pihps','live','2026-10-19T17:00:00Z')")
  // Initialize catalogs so total_changes isolates marker writes below.
  db.exec(planImport({ from: date, to: date, observations: [], existing: [] }).sql)
  for (const [timestamp, count, latest] of [
    ['2026-10-19T17:00:00.000Z', 0, '2026-10-19T17:00:00Z'],
    ['2026-10-19T17:00:00.100Z', 1, '2026-10-19T17:00:00.100Z'],
    ['2026-10-19T17:00:00Z', 0, '2026-10-19T17:00:00.100Z'],
    ['2026-10-19T17:00:00.000Z', 0, '2026-10-19T17:00:00.100Z'],
    ['2026-10-19T17:00:00.100Z', 0, '2026-10-19T17:00:00.100Z'],
  ]) {
    const raw = yield* rawObservations(emptyRaw(date, timestamp), 'raw')
    const plan = planImport({ from: date, to: date, observations: [], existing: [], coverage: [raw.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
    const before = db.prepare('SELECT total_changes() AS n').get().n
    db.exec(plan.sql)
    assert.strictEqual(plan.report.coverageChanges, count)
    assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n - before, count)
    assert.deepStrictEqual({ ...db.prepare('SELECT status,checked_at FROM source_days').get() }, { status: 'live', checked_at: latest })
  }
  db.close()
}))
it.effect('runtime coverage collision after planning preserves newer completion and refreshed counts are zero', () => Effect.gen(function* () {
  const date = '2026-10-19'
  const raw = yield* rawObservations(emptyRaw(date, '2026-10-19T04:00:00Z'), 'raw')
  const stale = planImport({ from: date, to: date, observations: [], existing: [], coverage: [raw.coverage] })
  assert.strictEqual(stale.report.coverageChanges, 1)
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec(planImport({ from: date, to: date, observations: [], existing: [] }).sql)
  db.exec("INSERT INTO source_days VALUES ('2026-10-19','pihps','empty','2026-10-19T17:00:00Z')")
  const before = db.prepare('SELECT total_changes() AS n').get().n
  db.exec(stale.sql)
  assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n - before, 0)
  assert.deepStrictEqual({ ...db.prepare('SELECT status,checked_at FROM source_days').get() }, { status: 'empty', checked_at: '2026-10-19T17:00:00Z' })
  const fresh = planImport({ from: date, to: date, observations: [], existing: [], coverage: [raw.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
  assert.strictEqual(fresh.report.coverageChanges, 0)
  db.close()
}))
it.effect('another source marker on the same date does not suppress a planned PIHPS insert', () => Effect.gen(function* () {
  const date = '2026-10-19'
  const raw = yield* rawObservations(emptyRaw(date, '2026-10-19T17:00:00Z'), 'raw')
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec(planImport({ from: date, to: date, observations: [], existing: [] }).sql)
  db.exec("INSERT INTO source_days VALUES ('2026-10-19','other','empty','2026-10-19T17:00:00Z')")
  const plan = planImport({ from: date, to: date, observations: [], existing: [], coverage: [raw.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
  const before = db.prepare('SELECT total_changes() AS n').get().n
  db.exec(plan.sql)
  assert.strictEqual(plan.report.coverageChanges, 1)
  assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n - before, 1)
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM source_days').get().n, 2)
  db.close()
}))
it.effect('importing same-day empty evidence years later cannot turn it into confirmed emptiness', () => Effect.gen(function* () {
  yield* TestClock.setTime(DateTime.unsafeMake('2030-01-01T00:00:00Z').epochMillis)
  const raw = yield* rawObservations(emptyRaw(row.date, '2018-10-09T04:00:00Z'), 'raw')
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  db.exec(planImport({ from: row.date, to: row.date, observations: [], existing: [], coverage: [raw.coverage] }).sql)
  assert.strictEqual(db.prepare('SELECT status FROM source_days').get().status, 'pending')
  db.close()
}))
it.effect('empty retries preserve an existing live day and its observed cells', () => Effect.gen(function* () {
  const date = '2026-10-19'
  const raw = yield* rawObservations(emptyRaw(date, '2026-10-19T04:00:00Z'), 'raw')
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  const observedRaw = emptyRaw(date, '2026-10-19T03:00:00Z')
  observedRaw.rows = observedRaw.rows.map((r) => r.region_code === '31' ? { ...r, status: 'ok', prices: { beras: 13200 } } : r)
  const observed = yield* rawObservations(observedRaw, 'raw')
  db.exec(planImport({ from: date, to: date, observations: observed.observations, existing: [], coverage: [observed.coverage] }).sql)
  assert.strictEqual(db.prepare('SELECT status FROM source_days').get().status, 'live')
  const plan = planImport({ from: date, to: date, observations: [], existing: db.prepare('SELECT * FROM prices_daily').all(), coverage: [raw.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
  db.exec(plan.sql)
  assert.strictEqual(db.prepare('SELECT status FROM source_days').get().status, 'live')
  assert.strictEqual(db.prepare('SELECT price FROM prices_daily').get().price, 13200)
  db.close()
}))
it.effect('malformed and noncanonical source-check timestamps fail in the typed decode channel', () => Effect.gen(function* () {
  for (const fetchedAt of ['not-a-timestamp', '2026-02-30T04:00:00Z', '2026-10-19', '2026-10-19T04:00:00', '2026-10-19T04:00:00+00:00']) {
    const result = yield* Effect.either(rawObservations(emptyRaw('2026-10-19', fetchedAt), 'raw'))
    assert.strictEqual(result._tag, 'Left')
    assert.strictEqual(result.left._tag, 'ParseError')
  }
}))
it.effect('trend range query narrows by commodity and source before scanning dates', () => Effect.sync(() => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  const plans = db.prepare("EXPLAIN QUERY PLAN SELECT date,AVG(price) FROM prices_daily WHERE commodity_id='beras' AND source_id='pihps' AND level='eceran' AND date>='2017-03-27' AND date<='2026-09-15' GROUP BY date ORDER BY date LIMIT 401").all()
  assert.ok(plans.some((p) => p.detail.includes('prices_daily_trend') && p.detail.includes('commodity_id=? AND source_id=? AND level=? AND date>')))
  db.close()
}))
it.effect('only fully verified raw coverage can publish source-day markers', () => Effect.gen(function* () {
  const raw = { date: row.date, source: 'pihps', fetchedAt: '2026-10-19T00:00:00Z', rows: SCOPES.map((s) => ({ ...s, prices: {}, status: 'source-empty' })) }
  const empty = yield* rawObservations(raw, 'raw')
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('db/schema.sql', 'utf8'))
  const plan = planImport({ from: row.date, to: row.date, observations: [], existing: [], coverage: [empty.coverage] })
  db.exec(plan.sql)
  assert.strictEqual(plan.report.coverageChanges, 1)
  assert.strictEqual(db.prepare('SELECT status FROM source_days').get().status, 'empty')
  const partial = yield* rawObservations({ ...raw, rows: raw.rows.map((r, i) => i === 1 ? { ...r, prices: { beras: 13200 }, status: 'http-error', preserved: true } : r) }, 'raw')
  const failed = planImport({ from: row.date, to: row.date, observations: partial.observations, existing: [], coverage: [partial.coverage], existingCoverage: db.prepare('SELECT * FROM source_days').all() })
  db.exec(failed.sql)
  assert.strictEqual(failed.report.coverageChanges, 0)
  assert.strictEqual(failed.report.unresolvedErrors.length, 1)
  assert.strictEqual(db.prepare('SELECT status FROM source_days').get().status, 'empty')
  db.close()
}))
it.effect('seed CLI creates an explicit local dry run without changing the supplied SQLite database', () => Effect.gen(function* () {
  const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-import-')))
  const path = join(dir, 'baseline.sqlite'), snapshot = join(dir, 'snapshot.json'), output = join(dir, 'repair.sql')
  const db = new DatabaseSync(path)
  db.exec(readFileSync('db/schema.sql', 'utf8')); db.close()
  yield* Effect.promise(() => writeFile(snapshot, JSON.stringify({ rows: [row] })))
  const result = yield* Effect.promise(() => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./seed-d1.mjs', import.meta.url)), '--snapshot', snapshot, '--from', row.date, '--to', row.date, '--target', 'local', '--dry-run', '--existing-db', path, '--out', output]))
  assert.ok(result.stdout.includes('"inserts":1'))
  const readOnly = new DatabaseSync(path, { readOnly: true })
  assert.strictEqual(readOnly.prepare('SELECT COUNT(*) AS n FROM prices_daily').get().n, 0); readOnly.close()
  const report = JSON.parse(yield* Effect.promise(() => readFile(`${output}.report.json`, 'utf8')))
  assert.strictEqual(report.applied, false)
  assert.strictEqual(report.target, 'local')
  assert.strictEqual(report.coverageChanges, 0)
  yield* Effect.promise(() => rm(dir, { recursive: true, force: true }))
}))
