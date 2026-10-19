import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256 } from './pihps-history.mjs'

const run = (args) => Effect.tryPromise({ try: () => promisify(execFile)(process.execPath,
  ['scripts/seed-d1.mjs', ...args], { maxBuffer: 1024 * 1024 }), catch: (cause) => cause })
const withDatabase = (use) => Effect.acquireUseRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-history-restore-'))),
  (directory) => Effect.acquireUseRelease(
    Effect.sync(() => { const db = new DatabaseSync(join(directory, 'baseline.sqlite')); db.exec(readFileSync('db/schema.sql', 'utf8')); return db }),
    (db) => use({ db, directory, baseline: join(directory, 'baseline.sqlite'), output: join(directory, 'history.sql') }),
    (db) => Effect.sync(() => db.close())),
  (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
)
const args = (baseline, output, extra = []) => ['--history-dir', 'data/history/pihps', '--from', '2017-03-27',
  '--to', '2026-09-15', '--target', 'local', '--dry-run', '--existing-db', baseline, '--out', output, ...extra]

it.effect('restores all history and both 38-province fixtures, preserves metadata, and replays with zero writes', () => withDatabase(({ db, baseline, output }) => Effect.gen(function* () {
  db.exec("INSERT INTO commodities VALUES ('beras','Beras','kg'); INSERT INTO regions VALUES ('31','DKI Jakarta','province'); INSERT INTO prices_daily VALUES ('2026-10-19','beras','31','eceran',16000,'pihps','existing'); INSERT INTO source_days VALUES ('2026-10-19','pihps','live','2026-10-19T07:15:00Z'); INSERT INTO job_runs (started_at,source_id,status,rows_upserted) VALUES ('2026-10-19T07:15:00Z','pihps','complete',1)")
  const metadata = () => JSON.stringify([db.prepare('SELECT * FROM source_days').all(), db.prepare('SELECT * FROM job_runs').all()])
  const beforeMetadata = metadata()
  yield* run(args(baseline, output))
  const report = JSON.parse(yield* Effect.promise(() => readFile(`${output}.report.json`, 'utf8')))
  assert.strictEqual(report.inserts, 791426)
  assert.strictEqual(report.coverageChanges, 0)
  assert.strictEqual(report.unknownWeekdays.length, 23)
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM prices_daily').get().n, 1)
  db.exec(yield* Effect.promise(() => readFile(output, 'utf8')))
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM prices_daily').get().n, 791427)
  for (const date of ['2018-10-09', '2025-10-30']) {
    const fixture = JSON.parse(readFileSync(`src/data/fixtures/pihps-${date}.json`, 'utf8'))
    const prices = new Map(db.prepare("SELECT region_code,price FROM prices_daily WHERE date=? AND commodity_id='beras'").all(date).map((r) => [r.region_code, r.price]))
    assert.deepStrictEqual(fixture.rows.map(({ regionCode }) => ({ regionCode, price: prices.get(regionCode) ?? null })), fixture.rows)
    const national = db.prepare("SELECT AVG(price) AS mean FROM prices_daily WHERE date=? AND commodity_id='beras' AND source_id='pihps'").get(date).mean
    assert.strictEqual(Math.round(national / 50) * 50, fixture.expected.nationalAvg)
  }
  const checksum = () => sha256(JSON.stringify(db.prepare('SELECT * FROM prices_daily ORDER BY date,commodity_id,region_code,level').all()))
  const before = checksum()
  yield* run(args(baseline, output))
  const repeat = JSON.parse(yield* Effect.promise(() => readFile(`${output}.report.json`, 'utf8')))
  assert.strictEqual(repeat.inserts, 0)
  assert.strictEqual(repeat.unchanged, 791426)
  const changes = db.prepare('SELECT total_changes() AS n').get().n
  db.exec(yield* Effect.promise(() => readFile(output, 'utf8')))
  assert.strictEqual(db.prepare('SELECT total_changes() AS n').get().n, changes)
  assert.strictEqual(checksum(), before)
  assert.strictEqual(metadata(), beforeMetadata)
  assert.strictEqual(db.prepare("SELECT price FROM prices_daily WHERE date='2026-10-19'").get().price, 16000)
})), 60000)

it.effect('official conflicts win while other-source collisions and ambiguous inputs fail planning', () => withDatabase(({ db, baseline, output }) => Effect.gen(function* () {
  const bounded = (extra = []) => {
    const request = args(baseline, output, extra)
    request[request.indexOf('--from') + 1] = '2018-10-09'
    request[request.indexOf('--to') + 1] = '2018-10-09'
    return request
  }
  db.exec("INSERT INTO commodities VALUES ('beras','Beras','kg'); INSERT INTO regions VALUES ('31','DKI Jakarta','province'); INSERT INTO prices_daily VALUES ('2018-10-09','beras','31','eceran',14000,'pihps','existing')")
  yield* run(bounded())
  const report = JSON.parse(yield* Effect.promise(() => readFile(`${output}.report.json`, 'utf8')))
  assert.deepStrictEqual(report.differingOfficial, [{ key: '2018-10-09:beras:31:eceran', existing: 14000, proposed: 13200 }])
  db.exec(yield* Effect.promise(() => readFile(output, 'utf8')))
  assert.strictEqual(db.prepare("SELECT price FROM prices_daily WHERE date='2018-10-09' AND commodity_id='beras' AND region_code='31'").get().price, 14000)
  db.exec("UPDATE prices_daily SET source_id='other' WHERE date='2018-10-09' AND commodity_id='beras' AND region_code='31'")
  assert.strictEqual((yield* Effect.either(run(bounded())))._tag, 'Left')
  assert.strictEqual((yield* Effect.either(run(bounded(['--snapshot', 'data/snapshots/latest.json']))))._tag, 'Left')
})), 60000)
