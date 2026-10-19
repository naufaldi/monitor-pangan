import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
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
