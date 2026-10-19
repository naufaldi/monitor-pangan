import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requestScope, scrapeDate, scrapeDates, summarizeRaw, writeRawAtomic, normalizationReport, SCOPES } from './pihps-scrape.mjs'

const date = '2025-10-30'
const scopes = [{ province_id: '13', region_code: '31' }, { province_id: '1', region_code: '11' }]
const good = { date, source: 'pihps', fetchedAt: '2025-10-30T12:00:00Z', rows: scopes.map((s) => ({ ...s, status: 'ok', prices: { beras: 16300 } })) }
it.effect('exhausted HTTP retries remain errors and invalid JSON is retried', () => Effect.gen(function* () {
  for (const fetcher of [
    () => Promise.resolve({ ok: false, status: 503 }),
    () => Promise.reject(new Error('connection reset')),
    () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('invalid json')) }),
    () => Promise.resolve({ ok: true, json: () => Promise.resolve({ wrong: [] }) }),
  ]) {
    const sleeps = []
    const result = yield* requestScope(date, scopes[0], { fetch: fetcher, sleep: (ms) => Effect.sync(() => sleeps.push(ms)) })
    assert.strictEqual(result.status, 'http-error')
    assert.strictEqual(result.attempts, 3)
    assert.deepStrictEqual(sleeps, [1500, 3000])
  }
}))
it.effect('partial failure remains visible while preserving successful and previously observed cells', () => Effect.gen(function* () {
  const raw = yield* scrapeDate(date, { scopes, existing: good, request: (_, s) => Effect.succeed(s.region_code === '31' ? { ...s, status: 'ok', prices: { beras: 16400 } } : { ...s, status: 'http-error', prices: {}, error: '503' }), sleep: () => Effect.void })
  assert.strictEqual(raw.rows[1].prices.beras, 16300)
  assert.strictEqual(summarizeRaw(raw, scopes).status, 'partial-error')
  assert.strictEqual(summarizeRaw(raw, scopes).verified, false)
}))
it.effect('all-empty degraded retry cannot erase a good saved observation', () => Effect.gen(function* () {
  const raw = yield* scrapeDate(date, { scopes, existing: good, request: (_, s) => Effect.succeed({ ...s, status: 'source-empty', prices: {} }), sleep: () => Effect.void })
  assert.strictEqual(raw.rows[0].prices.beras, 16300)
  assert.strictEqual(summarizeRaw(raw, scopes).verified, false)
}))
it.effect('atomic writer leaves a corrupt existing file intact and reports failure', () => Effect.gen(function* () {
  const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-')))
  const path = join(dir, 'raw.json')
  yield* Effect.promise(() => writeFile(path, '{corrupt'))
  const result = yield* Effect.either(writeRawAtomic(path, good))
  assert.strictEqual(result._tag, 'Left')
  assert.strictEqual(yield* Effect.promise(() => readFile(path, 'utf8')), '{corrupt')
  yield* Effect.promise(() => rm(dir, { recursive: true, force: true }))
}))
it.effect('atomic writer retains good cells on a forced failed refresh', () => Effect.gen(function* () {
  const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-write-')))
  const path = join(dir, 'raw.json')
  yield* writeRawAtomic(path, good)
  const raw = yield* writeRawAtomic(path, { ...good, rows: scopes.map((s) => ({ ...s, status: 'http-error', prices: {}, error: '503' })) })
  assert.strictEqual(raw.rows[0].prices.beras, 16300)
  assert.strictEqual(raw.rows[0].preserved, true)
  const saved = JSON.parse(yield* Effect.promise(() => readFile(path, 'utf8')))
  assert.strictEqual(saved.rows[1].prices.beras, 16300)
  assert.strictEqual(saved.rows[1].status, 'http-error')
  yield* Effect.promise(() => rm(dir, { recursive: true, force: true }))
}))
it.effect('coverage keeps partial dates and chooses newest verified live date only', () => Effect.sync(() => {
  const partial = { ...good, date: '2025-10-31', rows: [{ ...good.rows[0], status: 'http-error' }, good.rows[1]] }
  const report = normalizationReport([good, partial], scopes)
  assert.strictEqual(report.dates.length, 2)
  assert.strictEqual(report.dates[1].status, 'partial-error')
  assert.strictEqual(report.newestVerifiedLiveDate, '2025-10-30')
}))
it.effect('a full-date HTTP outage keeps resumable output, signals failure and backs off before next date', () => Effect.gen(function* () {
  const saved = [], sleeps = []
  const result = yield* scrapeDates(['2025-10-30', '2025-10-31'], {
    read: () => Effect.succeed(null), write: (_, raw) => Effect.sync(() => { saved.push(raw); return raw }),
    request: (_, scope) => Effect.succeed({ ...scope, status: 'http-error', prices: {}, error: '503' }),
    sleep: (ms) => Effect.sync(() => sleeps.push(ms)),
  })
  assert.strictEqual(result.failed, true)
  assert.strictEqual(saved.length, 2)
  assert.strictEqual(saved[0].rows.length, 35)
  assert.deepStrictEqual(sleeps.filter((ms) => ms === 60000), [60000])
}))
it.effect('CLI returns nonzero for saved HTTP failures without reissuing requests', () => Effect.gen(function* () {
  const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-cli-')))
  yield* Effect.promise(() => mkdir(join(dir, 'data/raw'), { recursive: true }))
  const raw = { ...good, rows: SCOPES.map((scope) => ({ ...scope, status: 'http-error', prices: {}, error: '503' })) }
  yield* Effect.promise(() => writeFile(join(dir, `data/raw/pihps-${date}.json`), JSON.stringify(raw)))
  const result = yield* Effect.tryPromise(() => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./scrape-pihps.mjs', import.meta.url)), date], { cwd: dir })).pipe(Effect.either)
  assert.strictEqual(result._tag, 'Left')
  assert.strictEqual(result.left.error.code, 1)
  assert.ok(result.left.error.stdout.includes('"status":"http-error"'))
  yield* Effect.promise(() => rm(dir, { recursive: true, force: true }))
}))
it.effect('normalization writes partial coverage alongside retained observations in an isolated workspace', () => Effect.gen(function* () {
  const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-normalize-')))
  yield* Effect.promise(() => mkdir(join(dir, 'data/raw'), { recursive: true }))
  const live = { ...good, rows: SCOPES.map((s) => ({ ...s, status: 'ok', prices: { beras: 16300 } })) }
  const partial = { ...live, date: '2025-10-31', rows: live.rows.map((r, i) => i === 1 ? { ...r, status: 'http-error', preserved: true, error: '503' } : r) }
  yield* Effect.promise(() => writeFile(join(dir, 'data/raw/panelharga-test.json'), JSON.stringify({ catalog: { provinces: { data: [{ national_id: '31' }] }, cms_eceran: { data: [] } } })))
  yield* Effect.promise(() => writeFile(join(dir, `data/raw/pihps-${live.date}.json`), JSON.stringify(live)))
  yield* Effect.promise(() => writeFile(join(dir, `data/raw/pihps-${partial.date}.json`), JSON.stringify(partial)))
  yield* Effect.promise(() => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./normalize.mjs', import.meta.url))], { cwd: dir }))
  const report = JSON.parse(yield* Effect.promise(() => readFile(join(dir, 'data/snapshots/coverage.json'), 'utf8')))
  const snapshot = JSON.parse(yield* Effect.promise(() => readFile(join(dir, 'data/snapshots/2025.json'), 'utf8')))
  assert.strictEqual(report.newestVerifiedLiveDate, '2025-10-30')
  assert.strictEqual(report.dates[1].status, 'partial-error')
  assert.strictEqual(snapshot.rows.find((r) => r.date === '2025-10-31' && r.commodity_id === 'beras').price, 16300)
  yield* Effect.promise(() => rm(dir, { recursive: true, force: true }))
}))
