import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { cp, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { COMMODITY_ROWS, REGION_ROWS } from '../src/data/pihps-catalog.ts'
import * as history from './pihps-history.mjs'
import * as files from './pihps-history-files.mjs'

const sample = () => ({ schemaVersion: 1, year: 2018, dates: ['2018-10-09'],
  values: Object.fromEntries(COMMODITY_ROWS.map(([id]) => [id,
    Object.fromEntries(REGION_ROWS.map(([code]) => [code, [code === '31' ? 13200 : null]]))])) })

it.effect('parses provincial columns without converting nulls into observations', () => Effect.gen(function* () {
  const year = yield* history.decodeYear(sample())
  const observations = history.historyObservations({ years: [year] })
  assert.strictEqual(observations.length, 10)
  assert.ok(observations.every((r) => r.region_code === '31' && r.price === 13200))
  assert.strictEqual(year.values.beras['93'][0], null)
  assert.strictEqual(observations[0].raw_ref, 'git:ef85f27904b044bd343a56dcdd77a46d28eb1205:public/series/2018.json')
}))

it.effect('rejects invalid dates, prices, columns and array lengths at the file boundary', () => Effect.gen(function* () {
  const invalid = []
  for (const price of [0, -1, Infinity, NaN, 1.5, '13200']) {
    const year = sample(); year.values.beras['31'][0] = price; invalid.push(year)
  }
  for (const date of ['2018-02-30', '2018-10-13', '2019-10-09', '2018-1-09']) {
    const year = sample(); year.dates[0] = date; invalid.push(year)
  }
  const duplicate = sample(); duplicate.dates.push('2018-10-09'); invalid.push(duplicate)
  const missing = sample(); delete missing.values.beras['93']; invalid.push(missing)
  const extra = sample(); extra.values.beras.nasional = [11707]; invalid.push(extra)
  const length = sample(); length.values.beras['31'].push(14000); invalid.push(length)
  const outside = sample(); outside.year = 2026; outside.dates = ['2026-09-16']; invalid.push(outside)
  const unrelated = sample(); unrelated.rawResponses = []; invalid.push(unrelated)
  for (const year of invalid) assert.strictEqual((yield* Effect.either(history.decodeYear(year)))._tag, 'Left')
}))

it.effect('canonical serialization is independent of input object ordering', () => Effect.gen(function* () {
  const year = sample()
  const reversed = { ...year, values: Object.fromEntries(Object.entries(year.values).reverse()) }
  const a = history.serializeYear(yield* history.decodeYear(year))
  const b = history.serializeYear(yield* history.decodeYear(reversed))
  assert.strictEqual(a, b)
  assert.deepStrictEqual(JSON.parse(a), year)
}))

const withTemporary = (use) => Effect.acquireUseRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-history-'))),
  use,
  (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
)
it.effect('failed staged validation leaves every previous archive file intact', () => withTemporary((root) => Effect.gen(function* () {
  const directory = join(root, 'archive')
  const validate = (path) => files.io(() => readFile(join(path, 'manifest.json'), 'utf8')).pipe(
    Effect.flatMap((value) => value === 'valid' ? Effect.void : Effect.fail(new Error('invalid stage'))))
  yield* files.publishHistory(directory, new Map([['manifest.json', 'valid']]), validate)
  const result = yield* Effect.either(files.publishHistory(directory, new Map([['manifest.json', 'invalid']]), validate))
  assert.strictEqual(result._tag, 'Left')
  assert.strictEqual(yield* files.io(() => readFile(join(directory, 'manifest.json'), 'utf8')), 'valid')
  assert.deepStrictEqual(yield* files.io(() => readdir(root)), ['archive'])
})))

it.effect('an existing publication lock rejects overlapping writers without touching the archive', () => withTemporary((root) => Effect.gen(function* () {
  const directory = join(root, 'archive')
  yield* files.io(() => writeFile(`${directory}.lock`, 'another writer'))
  const result = yield* Effect.either(files.publishHistory(directory, new Map([['manifest.json', 'new']]), () => Effect.void))
  assert.strictEqual(result._tag, 'Left')
  assert.strictEqual(yield* files.io(() => readFile(`${directory}.lock`, 'utf8')), 'another writer')
  assert.deepStrictEqual(yield* files.io(() => readdir(root)), ['archive.lock'])
})))

it.effect('an install failure after moving the old archive rolls it back', () => withTemporary((root) => Effect.gen(function* () {
  const directory = join(root, 'archive')
  yield* files.publishHistory(directory, new Map([['manifest.json', 'original']]), () => Effect.void)
  const result = yield* Effect.either(files.publishHistory(directory, new Map([['manifest.json', 'replacement']]),
    (stage) => files.io(() => rename(stage, `${stage}.missing`))))
  assert.strictEqual(result._tag, 'Left')
  assert.strictEqual(yield* files.io(() => readFile(join(directory, 'manifest.json'), 'utf8')), 'original')
  assert.ok(!(yield* files.io(() => readdir(root))).includes('archive.lock'))
})))

it.effect('hash, count and schema tampering fail validation and a rejected rebuild preserves bytes', () => withTemporary((root) => Effect.gen(function* () {
  const directory = join(root, 'archive')
  yield* files.io(() => cp('data/history/pihps', directory, { recursive: true }))
  const path = join(directory, 'manifest.json')
  const original = yield* files.io(() => readFile(path, 'utf8'))
  for (const mutate of [
    (manifest) => { manifest.years[0].sha256 = '0'.repeat(64) },
    (manifest) => { manifest.years[0].observations++ },
    (manifest) => { manifest.schemaVersion = 2 },
    (manifest) => { manifest.source.originalHttpResponses = true },
  ]) {
    const manifest = JSON.parse(original); mutate(manifest)
    const damaged = history.serializeManifest(manifest)
    yield* files.io(() => writeFile(path, damaged))
    assert.strictEqual((yield* Effect.either(files.readHistory(directory)))._tag, 'Left')
    assert.strictEqual((yield* Effect.either(files.rebuildHistory(directory)))._tag, 'Left')
    assert.strictEqual(yield* files.io(() => readFile(path, 'utf8')), damaged)
  }
  yield* files.io(() => writeFile(path, original))
  const yearPath = join(directory, '2018.json')
  const year = JSON.parse(yield* files.io(() => readFile(yearPath, 'utf8')))
  year.values.beras['31'][0] = 0
  const text = history.serializeYear(year)
  yield* files.io(() => writeFile(yearPath, text))
  const manifest = JSON.parse(original)
  manifest.years[1].sha256 = history.sha256(text)
  manifest.years[1].bytes = Buffer.byteLength(text)
  yield* files.io(() => writeFile(path, history.serializeManifest(manifest)))
  assert.strictEqual((yield* Effect.either(files.readHistory(directory)))._tag, 'Left')
})), 15000)

it.effect('rebuilding the complete archive twice leaves every file byte-identical', () => withTemporary((root) => Effect.gen(function* () {
  const directory = join(root, 'archive')
  yield* files.io(() => cp('data/history/pihps', directory, { recursive: true }))
  const digest = (dir) => files.io(() => readdir(dir, { recursive: true, withFileTypes: true })).pipe(
    Effect.map((entries) => entries.filter((entry) => entry.isFile()).map((entry) => relative(dir, join(entry.parentPath, entry.name))).sort()),
    Effect.flatMap((names) => Effect.forEach(names,
      (name) => files.io(() => readFile(join(dir, name))).pipe(Effect.map((text) => [name, history.sha256(text)])))))
  const before = yield* digest(directory)
  yield* files.rebuildHistory(directory)
  yield* files.rebuildHistory(directory)
  assert.deepStrictEqual(yield* digest(directory), before)
})), 15000)
