import { Clock, DateTime, Effect, Schema } from 'effect'
import { ArchiveTimestampSchema } from '../src/worker/archive-outbox.ts'
import { readArchiveHead } from './pihps-history-sync.mjs'

const Count = Schema.Number.pipe(Schema.int(), Schema.nonNegative())
export const archiveStatus = ({ query, merged, published, metadataAvailable = true, lastSuccessfulExportAt = null, lastSuccessfulMergeAt = null,
  lastAttemptOutcome = null, prUrl = null }) => Effect.gen(function* () {
  const known = { mergedSequence: merged?.throughSequence ?? null, publishedSequence: published?.throughSequence ?? null,
    lastSuccessfulExportAt, lastSuccessfulMergeAt, lastAttemptOutcome, prUrl }
  return yield* Effect.gen(function* () {
    const head = yield* readArchiveHead(query)
    if ([merged, published].some((manifest) => manifest?.epoch != null && manifest.epoch !== head.epoch)) {
      return { ...known, status: 'error', category: 'epoch_mismatch', epoch: head.epoch, archiveLagSeconds: null }
    }
    if ([known.mergedSequence, known.publishedSequence].some((sequence) => sequence != null && sequence > head.sequence)) {
      return { ...known, status: 'error', category: 'checkpoint_ahead', epoch: head.epoch, archiveLagSeconds: null }
    }
    const backlog = (sequence) => sequence == null ? Effect.succeed({ count: null, oldestAt: null }) : Effect.gen(function* () {
      const counts = yield* query('SELECT COUNT(*) AS count FROM pihps_archive_events WHERE seq > ?', [sequence])
        .pipe(Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ count: Count })).pipe(Schema.itemsCount(1)))))
      const oldest = yield* query('SELECT captured_at FROM pihps_archive_events WHERE seq > ? ORDER BY julianday(captured_at), seq LIMIT 1', [sequence])
        .pipe(Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ captured_at: ArchiveTimestampSchema })).pipe(Schema.maxItems(1)))))
      return { count: counts[0].count, oldestAt: oldest[0]?.captured_at ?? null }
    })
    const unmerged = yield* backlog(known.mergedSequence), unpublished = yield* backlog(known.publishedSequence)
    const unpublishedEventCount = unpublished.count, unmergedEventCount = unmerged.count
    const now = yield* Clock.currentTimeMillis
    const age = (value) => value == null ? 0 : Math.max(0, Math.floor((now - DateTime.toEpochMillis(DateTime.unsafeMake(value))) / 1000))
    const available = metadataAvailable && merged != null && published != null
    return { ...known, status: !available ? 'unavailable' : lastAttemptOutcome === 'error' ? 'error' : unpublishedEventCount > 0 ? 'behind' : unmergedEventCount > 0 ? 'awaiting_review' : merged.epoch == null ? 'not_initialized' : 'caught_up',
      ...(!available ? { category: 'github_evidence_unavailable' } : {}),
      epoch: head.epoch, latestD1Sequence: head.sequence, unpublishedEventCount, unmergedEventCount,
      oldestUnmergedCapturedAt: unmerged.oldestAt, oldestUnpublishedCapturedAt: unpublished.oldestAt,
      archiveLagSeconds: unmerged.count == null ? null : age(unmerged.oldestAt), exportLagSeconds: unpublished.count == null ? null : age(unpublished.oldestAt) }
  }).pipe(Effect.catchAll(() => Effect.succeed({ ...known, status: 'unavailable', category: 'archive_evidence_unavailable',
    epoch: null, latestD1Sequence: null, unpublishedEventCount: null, unmergedEventCount: null,
    oldestUnmergedCapturedAt: null, oldestUnpublishedCapturedAt: null, archiveLagSeconds: null, exportLagSeconds: null })))
})
