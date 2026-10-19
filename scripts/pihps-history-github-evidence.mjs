import { DateTime, Effect, Schema } from 'effect'
import { ArchiveTimestampSchema } from '../src/worker/archive-outbox.ts'

const Runs = Schema.Struct({ workflow_runs: Schema.Array(Schema.Struct({ id: Schema.Number.pipe(Schema.int(), Schema.positive()), conclusion: Schema.NullOr(Schema.String) })) })
const Jobs = Schema.Struct({ jobs: Schema.Array(Schema.Struct({ conclusion: Schema.NullOr(Schema.String), steps: Schema.optional(Schema.Array(Schema.Struct({
  name: Schema.String, conclusion: Schema.NullOr(Schema.String), completed_at: Schema.NullOr(ArchiveTimestampSchema),
}))) })) })
const exportStepName = 'Export validated D1 changes and publish archive PR'

/** Workflow success alone is insufficient: the export job may have been skipped. */
export const githubExportEvidence = ({ request }) => Effect.gen(function* () {
  let available = true, lastAttemptOutcome = null, lastSuccessfulExportAt = null
  const read = (path, schema) => request(path).pipe(Effect.flatMap(Schema.decodeUnknown(schema)), Effect.either)
  const latest = yield* read('/runs?per_page=1', Runs)
  const completed = yield* read('/runs?status=completed&per_page=20', Runs)
  const cache = new Map()
  const jobsFor = (id) => Effect.gen(function* () {
    if (!cache.has(id)) cache.set(id, yield* read(`/runs/${id}/jobs`, Jobs))
    const result = cache.get(id)
    if (result._tag === 'Left') { available = false; return null }
    return result.right.jobs
  })
  if (latest._tag === 'Left') available = false
  else if (latest.right.workflow_runs[0]) {
    const run = latest.right.workflow_runs[0], jobs = yield* jobsFor(run.id)
    const step = jobs?.flatMap((job) => job.steps ?? []).find((step) => step.name === exportStepName)
    lastAttemptOutcome = step?.conclusion === 'success' ? 'complete' : step?.conclusion === 'failure' ? 'error'
      : jobs?.length > 0 && jobs.every((job) => job.conclusion === 'skipped') ? 'skipped' : run.conclusion == null ? 'running' : 'error'
    if (step?.conclusion === 'success') lastSuccessfulExportAt = step.completed_at
  }
  if (completed._tag === 'Left') available = false
  else for (const run of completed.right.workflow_runs.slice(0, 20)) {
    const jobs = yield* jobsFor(run.id)
    const step = jobs?.flatMap((job) => job.steps ?? []).find((step) => step.name === exportStepName && step.conclusion === 'success')
    if (step?.completed_at) {
      if (lastSuccessfulExportAt == null || DateTime.toEpochMillis(DateTime.unsafeMake(step.completed_at)) > DateTime.toEpochMillis(DateTime.unsafeMake(lastSuccessfulExportAt))) lastSuccessfulExportAt = step.completed_at
      break
    }
  }
  return { available, lastAttemptOutcome, lastSuccessfulExportAt }
})
