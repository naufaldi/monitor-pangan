import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { githubExportEvidence } from './pihps-history-github-evidence.mjs'

it.effect('skipped workflow runs do not manufacture successful archive exports', () => Effect.gen(function* () {
  const request = (path) => Effect.succeed(path.includes('/runs?') ? { workflow_runs: [
    { id: 2, conclusion: 'success' }, { id: 1, conclusion: 'success' },
  ] } : path.includes('/2/jobs') ? { jobs: [{ conclusion: 'skipped', steps: [] }] } : { jobs: [{ conclusion: 'success', steps: [
    { name: 'Export validated D1 changes and publish archive PR', conclusion: 'success', completed_at: '2026-10-19T10:30:00Z' },
  ] }] })
  const evidence = yield* githubExportEvidence({ request })
  assert.strictEqual(evidence.lastAttemptOutcome, 'skipped')
  assert.strictEqual(evidence.lastSuccessfulExportAt, '2026-10-19T10:30:00Z')
}))

it.effect('metadata outage retains independently readable successful export evidence', () => Effect.gen(function* () {
  const request = (path) => path.endsWith('per_page=1') ? Effect.fail(new Error('GitHub offline')) : Effect.succeed(
    path.includes('/runs?') ? { workflow_runs: [{ id: 1, conclusion: 'success' }] } : { jobs: [{ conclusion: 'success', steps: [
      { name: 'Export validated D1 changes and publish archive PR', conclusion: 'success', completed_at: '2026-10-19T10:30:00Z' },
    ] }] })
  const evidence = yield* githubExportEvidence({ request })
  assert.strictEqual(evidence.available, false)
  assert.strictEqual(evidence.lastSuccessfulExportAt, '2026-10-19T10:30:00Z')
  assert.strictEqual(evidence.lastAttemptOutcome, null)
}))

it.effect('export success survives a later artifact failure and a subsequent failed export', () => Effect.gen(function* () {
  const request = (path) => Effect.succeed(path.endsWith('per_page=1') ? { workflow_runs: [{ id: 3, conclusion: 'failure' }] }
    : path.includes('/runs?status=completed') ? { workflow_runs: [{ id: 3, conclusion: 'failure' }, { id: 2, conclusion: 'failure' }, { id: 1, conclusion: 'success' }] }
    : path.includes('/runs?') ? { workflow_runs: [{ id: 1, conclusion: 'success' }] }
    : { jobs: [{ conclusion: path.includes('/1/jobs') ? 'success' : 'failure', steps: [{
      name: 'Export validated D1 changes and publish archive PR', conclusion: path.includes('/3/jobs') ? 'failure' : 'success',
      completed_at: path.includes('/2/jobs') ? '2026-10-19T11:00:00Z' : '2026-10-19T10:00:00Z',
    }] }] })
  const evidence = yield* githubExportEvidence({ request })
  assert.strictEqual(evidence.lastAttemptOutcome, 'error')
  assert.strictEqual(evidence.lastSuccessfulExportAt, '2026-10-19T11:00:00Z')
}))
