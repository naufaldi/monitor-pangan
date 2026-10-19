import { Clock, DateTime, Effect, Schema } from 'effect'
import { ArchiveTimestampSchema } from '../src/worker/archive-outbox.ts'
import { readArchiveHead } from './pihps-history-sync.mjs'

const Count = Schema.Number.pipe(Schema.int(), Schema.nonNegative())
export const archiveStatus = ({ query, merged, published, metadataAvailable = true, lastSuccessfulExportAt = null, lastSuccessfulMergeAt = null,
  lastAttemptOutcome = null, prUrl = null }) => Effect.gen(function* () {
  const known = { mergedSequence: merged?.throughSequence ?? 0, publishedSequence: published?.throughSequence ?? merged?.throughSequence ?? 0,
    lastSuccessfulExportAt, lastSuccessfulMergeAt, lastAttemptOutcome, prUrl }
  return yield* Effect.gen(function* () {
    const head = yield* readArchiveHead(query)
    if ([merged, published].some((manifest) => manifest?.epoch != null && manifest.epoch !== head.epoch)) {
      return { ...known, status: 'error', category: 'epoch_mismatch', epoch: head.epoch, archiveLagSeconds: null }
    }
    if (Math.max(known.mergedSequence, known.publishedSequence) > head.sequence) {
      return { ...known, status: 'error', category: 'checkpoint_ahead', epoch: head.epoch, archiveLagSeconds: null }
    }
    const counts = yield* query('SELECT SUM(CASE WHEN seq > ? THEN 1 ELSE 0 END) AS unpublished, COUNT(*) AS unmerged FROM pihps_archive_events WHERE seq > ?',
      [known.publishedSequence, known.mergedSequence]).pipe(Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ unpublished: Schema.NullOr(Count), unmerged: Count })).pipe(Schema.itemsCount(1)))))
    const oldest = yield* query('SELECT captured_at FROM pihps_archive_events WHERE seq > ? ORDER BY julianday(captured_at), seq LIMIT 1', [known.mergedSequence])
      .pipe(Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ captured_at: ArchiveTimestampSchema })).pipe(Schema.maxItems(1)))))
    const unpublished = yield* query('SELECT captured_at FROM pihps_archive_events WHERE seq > ? ORDER BY julianday(captured_at), seq LIMIT 1', [known.publishedSequence])
      .pipe(Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ captured_at: ArchiveTimestampSchema })).pipe(Schema.maxItems(1)))))
    const unpublishedEventCount = counts[0].unpublished ?? 0, unmergedEventCount = counts[0].unmerged
    const oldestAt = oldest[0]?.captured_at ?? null
    const now = yield* Clock.currentTimeMillis
    const age = (value) => value == null ? 0 : Math.max(0, Math.floor((now - DateTime.toEpochMillis(DateTime.unsafeMake(value))) / 1000))
    return { ...known, status: !metadataAvailable ? 'unavailable' : lastAttemptOutcome === 'error' ? 'error' : unpublishedEventCount > 0 ? 'behind' : unmergedEventCount > 0 ? 'awaiting_review' : merged?.epoch == null ? 'not_initialized' : 'caught_up',
      ...(!metadataAvailable ? { category: 'github_evidence_unavailable' } : {}),
      epoch: head.epoch, latestD1Sequence: head.sequence, unpublishedEventCount, unmergedEventCount,
      oldestUnmergedCapturedAt: oldestAt, oldestUnpublishedCapturedAt: unpublished[0]?.captured_at ?? null,
      archiveLagSeconds: age(oldestAt), exportLagSeconds: age(unpublished[0]?.captured_at) }
  }).pipe(Effect.catchAll(() => Effect.succeed({ ...known, status: 'unavailable', category: 'archive_evidence_unavailable',
    epoch: null, latestD1Sequence: null, unpublishedEventCount: null, unmergedEventCount: null,
    oldestUnpublishedCapturedAt: null, archiveLagSeconds: null, exportLagSeconds: null })))
})
