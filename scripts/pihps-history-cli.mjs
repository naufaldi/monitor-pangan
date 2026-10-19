import { Cause, DateTime, Effect, Option, Schema } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { ArchiveSyncError, cloudflareQuery, sqliteQuery, syncArchive, reconcileRange } from './pihps-history-sync.mjs'
import { archiveStatus } from './pihps-history-status.mjs'
import { command, githubHost, publishArchiveUpdate } from './pihps-history-publish.mjs'
import { readHistory } from './pihps-history-files.mjs'
import { githubExportEvidence } from './pihps-history-github-evidence.mjs'
import { ArchiveTimestampSchema } from '../src/worker/archive-outbox.ts'

const failure = (category) => Effect.fail(new ArchiveSyncError({ category, message: category }))
const io = (fn) => Effect.tryPromise({ try: fn, catch: () => new ArchiveSyncError({ category: 'filesystem', message: 'archive filesystem operation failed' }) })
const receiptPath = 'data/repairs/pihps-archive-receipt.json'
const json = Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))

const archiveAtRef = (ref) => Effect.acquireUseRelease(io(() => mkdtemp(join(tmpdir(), 'pihps-status-'))),
  (directory) => Effect.gen(function* () {
    const names = (yield* command('git', ['ls-tree', '-r', '--name-only', ref, '--', 'data/history/pihps'])).trim().split('\n').filter(Boolean)
    for (const name of names) {
      if (!/^data\/history\/pihps\/(?:\d{4}\.json|manifest\.json|README\.md|updates\/(?:manifest\.json|\d{4}\.jsonl))$/.test(name)) return yield* failure('unexpected_archive_path')
      const path = join(directory, name.slice('data/history/pihps/'.length)), text = yield* command('git', ['show', `${ref}:${name}`])
      yield* io(() => mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, text)))
    }
    return yield* readHistory(directory)
  }), (directory) => io(() => rm(directory, { recursive: true, force: true })))

const remoteStatus = (query, repository, botLogin) => Effect.gen(function* () {
  let metadataAvailable = true
  const fetched = yield* command('git', ['fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main']).pipe(Effect.either)
  if (fetched._tag === 'Left') metadataAvailable = false
  const base = yield* archiveAtRef('origin/main').pipe(Effect.either)
  if (base._tag === 'Left') metadataAvailable = false
  const merged = base._tag === 'Right' ? base.right : null
  const found = yield* githubHost(repository, process.cwd()).pipe(Effect.flatMap((host) => host.find()), Effect.either)
  if (found._tag === 'Left') metadataAvailable = false
  const pr = found._tag === 'Right' ? found.right : null
  let published = found._tag === 'Right' ? merged : null
  if (pr?.state === 'OPEN') {
    published = null
    if (pr.author.login !== botLogin) metadataAvailable = false
    else {
      const pending = yield* command('git', ['fetch', 'origin', '+refs/heads/automation/pihps-history:refs/remotes/origin/automation/pihps-history']).pipe(
        Effect.andThen(archiveAtRef('origin/automation/pihps-history')), Effect.either)
      if (pending._tag === 'Left') metadataAvailable = false
      else published = pending.right
    }
  }
  const evidence = yield* githubExportEvidence({ request: (path) => command('gh', ['api', path.includes('/jobs')
    ? `repos/${repository}/actions${path}` : `repos/${repository}/actions/workflows/pihps-history-sync.yml${path}`]).pipe(Effect.flatMap(json)) })
  const commits = yield* command('gh', ['api', `repos/${repository}/commits?sha=main&path=data/history/pihps/updates/manifest.json&per_page=1`]).pipe(
    Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(Schema.Array(Schema.Struct({ commit: Schema.Struct({ committer: Schema.NullOr(Schema.Struct({ date: ArchiveTimestampSchema })) }) }))))), Effect.either)
  if (commits._tag === 'Left') metadataAvailable = false
  return yield* archiveStatus({ query, merged: merged?.updates.manifest, published: published?.updates.manifest,
    metadataAvailable: metadataAvailable && evidence.available, lastSuccessfulExportAt: evidence.lastSuccessfulExportAt,
    lastSuccessfulMergeAt: merged?.updates.manifest?.epoch == null || commits._tag === 'Left' ? null : commits.right[0]?.commit.committer?.date ?? null,
    lastAttemptOutcome: evidence.lastAttemptOutcome, prUrl: pr?.state === 'OPEN' ? pr.url : null })
})

const program = Effect.gen(function* () {
  const [operation, ...args] = process.argv.slice(2)
  const parsed = yield* Effect.try({ try: () => parseArgs({ args, options: {
    ...Object.fromEntries(['target', 'existing-db', 'archive-dir', 'published-dir', 'max-events', 'from', 'to'].map((key) => [key, { type: 'string' }])),
    'dry-run': { type: 'boolean' }, apply: { type: 'boolean' },
  } }), catch: () => new ArchiveSyncError({ category: 'arguments', message: 'invalid command arguments' }) })
  const options = parsed.values
  if (!['sync', 'reconcile', 'status', 'publish'].includes(operation) || !['local', 'remote'].includes(options.target)) return yield* failure('arguments')
  if (options.apply && operation !== 'reconcile') return yield* failure('apply_only_for_reconciliation')
  if (options.apply && options['dry-run']) return yield* failure('conflicting_apply_and_dry_run')
  if (operation === 'publish' && (options.target !== 'remote' || options['dry-run'])) return yield* failure('publish_requires_remote')
  const directory = options['archive-dir'] ?? 'data/history/pihps'
  const maxEvents = options['max-events'] == null ? 100 : Number(options['max-events'])
  yield* Schema.decodeUnknown(Schema.Number.pipe(Schema.int(), Schema.between(1, 100)))(maxEvents)
  const repository = process.env.GITHUB_REPOSITORY ?? 'naufaldi/monitor-pangan'
  const run = (query) => Effect.gen(function* () {
    if (operation === 'sync') return yield* syncArchive({ directory, query, maxEvents, dryRun: options['dry-run'] ?? false })
    if (operation === 'reconcile') return yield* reconcileRange({ query, from: options.from, to: options.to, apply: options.apply ?? false })
    if (operation === 'publish') {
      const host = yield* githubHost(repository, process.cwd())
      return yield* publishArchiveUpdate({ query, host, botLogin: process.env.PIHPS_ARCHIVE_BOT_LOGIN, maxEvents })
    }
    if (options.target === 'remote' && !options['published-dir']) return yield* remoteStatus(query, repository, process.env.PIHPS_ARCHIVE_BOT_LOGIN)
    const merged = yield* readHistory(directory)
    const published = options['published-dir'] ? yield* readHistory(options['published-dir']) : merged
    return yield* archiveStatus({ query, merged: merged.updates.manifest, published: published.updates.manifest })
  })
  if (options.target === 'remote') {
    if (options['existing-db']) return yield* failure('remote_rejects_local_database')
    const query = yield* cloudflareQuery({ account: process.env.CLOUDFLARE_ACCOUNT_ID, database: '2bfc02d3-5eaf-4c7c-999b-e8e77544be21', token: process.env.CLOUDFLARE_API_TOKEN })
    return yield* run(query)
  }
  if (!options['existing-db']) return yield* failure('explicit_local_database_required')
  return yield* Effect.acquireUseRelease(
    Effect.try({ try: () => new DatabaseSync(options['existing-db'], { readOnly: !(operation === 'reconcile' && options.apply) }), catch: () => new ArchiveSyncError({ category: 'database', message: 'cannot open local database' }) }),
    (db) => run(sqliteQuery(db)), (db) => Effect.sync(() => db.close()))
})

Effect.runPromise(Effect.gen(function* () {
  const result = yield* program.pipe(Effect.catchAllCause((cause) => {
    const error = Option.getOrNull(Cause.failureOption(cause))
    const category = error instanceof ArchiveSyncError ? error.category : 'validation_or_runtime'
    process.exitCode = 1
    return Effect.succeed({ outcome: 'error', category })
  }))
  const receipt = { ...result, completedAt: DateTime.formatIso(yield* DateTime.now) }
  yield* io(() => mkdir(dirname(receiptPath), { recursive: true }).then(() => writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)))
  if (process.env.GITHUB_STEP_SUMMARY) yield* io(() => writeFile(process.env.GITHUB_STEP_SUMMARY, `PIHPS archive synchronization\n\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\`\n`, { flag: 'a' }))
  console.log(JSON.stringify(receipt))
})).catch(() => { console.error('archive command failed'); process.exitCode = 1 })
