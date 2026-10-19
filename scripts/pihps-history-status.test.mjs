import { assert, it } from '@effect/vitest'
import { Effect, TestClock } from 'effect'
import { sqliteFixture } from '../src/worker/sqlite-test.ts'
import { CAPTURE_ARCHIVE_DAY_SQL } from '../src/worker/archive-outbox.ts'
import { sqliteQuery } from './pihps-history-sync.mjs'
import { archiveStatus } from './pihps-history-status.mjs'

it.effect('an old-date correction remains unmerged even when its PR is current', () => Effect.gen(function* () {
  const { sqlite, price } = yield* sqliteFixture
  yield* price('2018-10-09', '31', 14000)
  sqlite.prepare(CAPTURE_ARCHIVE_DAY_SQL).run(JSON.stringify({ date: '2018-10-09', checkedAt: '2026-10-19T10:15:00Z', kind: 'd1_reconciliation' }))
  yield* TestClock.setTime(1792405200000) // 2026-10-19T10:20:00Z
  const epoch = sqlite.prepare('SELECT epoch FROM pihps_archive_epoch').get().epoch
  const result = yield* archiveStatus({ query: sqliteQuery(sqlite), merged: null, published: { epoch, throughSequence: 1 } })
  assert.strictEqual(result.status, 'awaiting_review')
  assert.strictEqual(result.unpublishedEventCount, 0)
  assert.strictEqual(result.unmergedEventCount, 1)
  assert.strictEqual(result.archiveLagSeconds, 300)
  assert.strictEqual(result.exportLagSeconds, 0)
  assert.strictEqual(result.oldestUnpublishedCapturedAt, null)
  assert.strictEqual(result.mergedSequence, 0)
}))

it.effect('database failures remain unavailable and retain previous export success', () => Effect.gen(function* () {
  const result = yield* archiveStatus({ query: () => Effect.fail(new Error('secret')), merged: null, published: null,
    lastSuccessfulExportAt: '2026-10-19T10:15:00Z' })
  assert.strictEqual(result.status, 'unavailable')
  assert.strictEqual(result.lastSuccessfulExportAt, '2026-10-19T10:15:00Z')
  assert.strictEqual(result.archiveLagSeconds, null)
  assert.ok(!JSON.stringify(result).includes('secret'))
}))

it.effect('GitHub metadata outage preserves D1 lag and known publication checkpoints', () => Effect.gen(function* () {
  const { sqlite, price } = yield* sqliteFixture
  yield* price('2026-10-19', '31', 16000)
  sqlite.prepare(CAPTURE_ARCHIVE_DAY_SQL).run(JSON.stringify({ date: '2026-10-19', checkedAt: '2026-10-19T10:15:00Z', kind: 'd1_reconciliation' }))
  const result = yield* archiveStatus({ query: sqliteQuery(sqlite), merged: null, published: null, metadataAvailable: false,
    lastSuccessfulExportAt: '2026-10-19T10:00:00Z' })
  assert.strictEqual(result.status, 'unavailable')
  assert.strictEqual(result.unpublishedEventCount, 1)
  assert.strictEqual(result.latestD1Sequence, 1)
  assert.strictEqual(result.lastSuccessfulExportAt, '2026-10-19T10:00:00Z')
}))
