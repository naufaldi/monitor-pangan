import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { updateArchiveFiles, readUpdates, foldObservationUpdates, mergeArchiveEvents } from './pihps-history-updates.mjs'
import { readHistory, rebuildHistory } from './pihps-history-files.mjs'
import { historyObservations } from './pihps-history.mjs'

const epoch = 'a'.repeat(32), hash = 'b'.repeat(64)
export const event = (sequence = 1, date = '2026-10-19', price = 16000) => ({ schemaVersion: 1, epoch, sequence,
  kind: 'daily_ingest', date, capturedAt: '2026-10-19T10:15:00Z', sourceCheck: { status: 'live', checkedAt: '2026-10-19T10:15:00Z' },
  observations: [['beras', '31', price, null]] })
const temporary = (use) => Effect.acquireUseRelease(Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-updates-'))), use,
  (path) => Effect.promise(() => rm(path, { recursive: true, force: true })))

it.effect('later sequences correct older dates and never erase untouched provinces', () => Effect.sync(() => {
  const rows = foldObservationUpdates([
    { date: '2018-10-09', commodity_id: 'beras', region_code: '31', level: 'eceran', price: 13200 },
    { date: '2018-10-09', commodity_id: 'beras', region_code: '32', level: 'eceran', price: 12000 },
  ], [event(1), event(2, '2018-10-09', 14000)])
  assert.deepStrictEqual(rows.map((row) => row.price), [14000, 12000, 16000])
  assert.strictEqual(rows[0].raw_ref, `d1:pihps:${epoch}:2`)
}))

it.effect('canonical update files round-trip across survey years and replay without a diff', () => temporary((root) => Effect.gen(function* () {
  const events = [event(1), event(2, '2018-10-09', 14000), event(3, '2027-01-04', 17000)]
  const files = yield* updateArchiveFiles(events, hash)
  for (const [name, text] of files) {
    yield* Effect.promise(() => mkdir(dirname(join(root, name)), { recursive: true }))
    yield* Effect.promise(() => writeFile(join(root, name), text))
  }
  const updates = yield* readUpdates(root, hash)
  assert.strictEqual(updates.manifest.throughSequence, 3)
  assert.deepStrictEqual(updates.events, events)
  assert.deepStrictEqual([...(yield* updateArchiveFiles(mergeArchiveEvents(events, [events[0]]), hash))], [...files])
  assert.strictEqual((yield* Effect.either(readUpdates(root, 'c'.repeat(64))))._tag, 'Left')
  yield* Effect.promise(() => writeFile(join(root, 'updates/2026.jsonl'), '{}\n'))
  assert.strictEqual((yield* Effect.either(readUpdates(root, hash)))._tag, 'Left')
})))

it.effect('rejects conflicting replays, epoch changes, malformed prices and unsafe provenance', () => Effect.gen(function* () {
  assert.throws(() => mergeArchiveEvents([event()], [event(1, '2026-10-19', 18000)]))
  for (const invalid of [
    { ...event(), epoch: 'c'.repeat(32) },
    { ...event(2), observations: [['beras', '31', 0, null]] },
    { ...event(2), observations: [['beras', '31', 15000, 'https://example.com/?token=secret']] },
    { ...event(2), observations: [['beras', 'nasional', 15000, null]] },
    { ...event(2), observations: [['beras', '31', 15000, 'pihps-grid:2025-10-30:32']] },
    { ...event(2), rawResponse: 'forbidden' },
  ]) assert.strictEqual((yield* Effect.either(updateArchiveFiles([event(), invalid], hash)))._tag, 'Left')
}))

it.effect('history validation and rebuilding preserve updates and corrected observation provenance', () => temporary((root) => Effect.gen(function* () {
  yield* Effect.promise(() => cp('data/history/pihps', root, { recursive: true }))
  const base = yield* Effect.promise(() => readFile(join(root, 'manifest.json'), 'utf8'))
  const { hashText } = yield* Effect.promise(() => import('./pihps-history-updates.mjs'))
  const files = yield* updateArchiveFiles([event(1, '2018-10-09', 14000), event(2)], hashText(base))
  for (const [name, text] of files) {
    yield* Effect.promise(() => mkdir(dirname(join(root, name)), { recursive: true }))
    yield* Effect.promise(() => writeFile(join(root, name), text))
  }
  const archive = yield* readHistory(root)
  const rows = historyObservations(archive)
  assert.strictEqual(rows.find((row) => row.date === '2018-10-09' && row.commodity_id === 'beras' && row.region_code === '31').price, 14000)
  assert.strictEqual(archive.range.to, '2026-10-19')
  yield* rebuildHistory(root)
  assert.strictEqual(yield* Effect.promise(() => readFile(join(root, 'manifest.json'), 'utf8')), base)
  for (const [name, text] of files) assert.strictEqual(yield* Effect.promise(() => readFile(join(root, name), 'utf8')), text)
})), 15000)
