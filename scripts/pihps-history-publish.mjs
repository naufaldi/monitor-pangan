import { Effect, Schema } from 'effect'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { ArchiveSyncError, syncArchive } from './pihps-history-sync.mjs'
import { readHistory } from './pihps-history-files.mjs'
import { mergeArchiveEvents, updateArchiveFiles, hashText } from './pihps-history-updates.mjs'

const branch = 'automation/pihps-history'
const archivePath = 'data/history/pihps'
const permitted = (name) => /^data\/history\/pihps\/updates\/(?:manifest\.json|\d{4}\.jsonl)$/.test(name)
const reject = (category) => Effect.fail(new ArchiveSyncError({ category, message: category }))
/** No shell interpolation and no stderr/arguments in failures: auth output stays private. */
export const command = (file, args, options = {}) => Effect.tryPromise({
  try: () => new Promise((resolve, reject) => execFile(file, args, { maxBuffer: 24 * 1024 * 1024, timeout: 60000, ...options },
    (error, stdout) => error ? reject(new ArchiveSyncError({ category: 'command', message: `${file} failed`, exitCode: error.code })) : resolve(stdout))),
  catch: (error) => error instanceof ArchiveSyncError ? error : new ArchiveSyncError({ category: 'command', message: 'command failed' }),
})
const PrSchema = Schema.Struct({ number: Schema.Number.pipe(Schema.int(), Schema.positive()), state: Schema.Literal('OPEN', 'CLOSED', 'MERGED'),
  author: Schema.Struct({ login: Schema.NonEmptyString }), url: Schema.String.pipe(Schema.pattern(/^https:\/\/github\.com\//)), mergedAt: Schema.NullOr(Schema.String) })

export const githubHost = (repository, cwd) => Effect.gen(function* () {
  yield* Schema.decodeUnknown(Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)))(repository)
  const gh = (args) => command('gh', args, { cwd })
  const find = () => gh(['pr', 'list', '--repo', repository, '--head', branch, '--state', 'all', '--limit', '100', '--json', 'number,state,author,url,mergedAt']).pipe(
    Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(Schema.Array(PrSchema)))), Effect.map((rows) => [...rows].sort((a, b) => b.number - a.number)[0] ?? null))
  return {
    find,
    create: (bodyFile) => gh(['pr', 'create', '--repo', repository, '--base', 'main', '--head', branch,
      '--title', 'data: synchronize PIHPS repository history', '--body-file', bodyFile]).pipe(Effect.andThen(find)),
    update: (pr, bodyFile) => gh(['pr', 'edit', String(pr.number), '--repo', repository, '--body-file', bodyFile]).pipe(Effect.asVoid),
  }
})

/** Execute only trusted main's code; read the bot branch as validated data. */
export const publishArchiveUpdate = ({ root = process.cwd(), query, host, botLogin, maxEvents = 100 }) => Effect.gen(function* () {
  if (!botLogin) return yield* reject('missing_bot_identity')
  const env = { ...process.env }
  if (env.GH_TOKEN) {
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader'
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${env.GH_TOKEN}`).toString('base64')}`
  }
  const git = (args, cwd = root) => command('git', args, { cwd, env })
  yield* git(['fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main'])
  const remote = (yield* git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`])).trim()
  if (remote && !/^[a-f0-9]{40}\s+refs\/heads\/automation\/pihps-history$/.test(remote)) return yield* reject('invalid_remote_head')
  const previousSha = remote ? remote.split(/\s/)[0] : ''
  const pr = yield* host.find()
  if (pr && pr.author.login !== botLogin) return yield* reject('unexpected_pr_owner')
  if (pr?.state === 'CLOSED' && !pr.mergedAt) return yield* reject('closed_unmerged_pr')
  if (remote) {
    yield* git(['fetch', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`])
    const differences = (yield* git(['diff', '--name-only', `origin/main...origin/${branch}`])).trim().split('\n').filter(Boolean)
    if (differences.some((name) => !permitted(name))) return yield* reject('unexpected_branch_edits')
  }
  return yield* Effect.acquireUseRelease(
    Effect.tryPromise({ try: () => mkdtemp(join(tmpdir(), 'pihps-publish-')), catch: () => new ArchiveSyncError({ category: 'staging', message: 'cannot stage archive' }) }),
    (temporary) => Effect.gen(function* () {
      const checkout = join(temporary, 'checkout')
      yield* git(['worktree', 'add', '--detach', checkout, 'origin/main'])
      return yield* Effect.gen(function* () {
        const directory = join(checkout, archivePath)
        const main = yield* readHistory(directory)
        let hasPendingBranch = false
        if (remote) {
          const names = (yield* git(['ls-tree', '-r', '--name-only', `origin/${branch}`, '--', `${archivePath}/updates`])).trim().split('\n').filter(Boolean)
          const pendingRoot = join(temporary, 'pending')
          yield* Effect.tryPromise({ try: () => mkdir(pendingRoot), catch: () => new ArchiveSyncError({ category: 'staging', message: 'staging failed' }) })
          for (const name of names) {
            if (!permitted(name)) return yield* reject('unexpected_branch_edits')
            const text = yield* git(['show', `origin/${branch}:${name}`])
            const path = join(pendingRoot, name.slice(`${archivePath}/`.length))
            yield* Effect.tryPromise({ try: () => mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, text)), catch: () => new ArchiveSyncError({ category: 'staging', message: 'staging failed' }) })
          }
          const { readUpdates } = yield* Effect.promise(() => import('./pihps-history-updates.mjs'))
          const baseText = yield* git(['show', `origin/main:${archivePath}/manifest.json`])
          const pending = yield* readUpdates(pendingRoot, hashText(baseText))
          const mergedSequences = new Set(main.updates.events.map((event) => event.sequence))
          hasPendingBranch = pending.events.some((event) => !mergedSequences.has(event.sequence))
          const union = yield* Effect.try({ try: () => mergeArchiveEvents(main.updates.events, pending.events), catch: () => new ArchiveSyncError({ category: 'conflicting_event', message: 'pending events conflict with main' }) })
          for (const [name, text] of yield* updateArchiveFiles(union, hashText(baseText))) {
            const path = join(directory, name)
            yield* Effect.tryPromise({ try: () => mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, text)), catch: () => new ArchiveSyncError({ category: 'staging', message: 'staging failed' }) })
          }
        }
        const result = yield* syncArchive({ directory, query, maxEvents })
        yield* readHistory(directory)
        yield* git(['add', '--', `${archivePath}/updates`], checkout)
        const compare = hasPendingBranch ? `origin/${branch}` : 'origin/main'
        const difference = yield* git(['diff', '--cached', '--quiet', compare, '--', `${archivePath}/updates`], checkout).pipe(Effect.either)
        if (difference._tag === 'Left' && difference.left.exitCode !== 1) return yield* Effect.fail(difference.left)
        const changed = difference._tag === 'Left'
        const bodyFile = join(temporary, 'body.md')
        const mergedKeys = new Set(main.updates.events.map((event) => event.sequence))
        const proposed = (yield* readHistory(directory)).updates.events.filter((event) => !mergedKeys.has(event.sequence))
        const dates = [...new Set(proposed.map((event) => event.date))].sort()
        const observations = proposed.reduce((count, event) => count + event.observations.length, 0)
        const body = `Incremental PIHPS observations exported from D1.\n\nSequence: ${main.updates.manifest?.throughSequence ?? 0} → ${result.throughSequence}. Remaining events: ${result.remainingEvents}.\n\nProposed events: ${proposed.length}. Provincial observation captures: ${observations}.\n\nNew or corrected survey dates: ${dates.join(', ') || 'none'}. Older survey dates are included when D1 records a correction or reconciliation.\n\nThe audited base is unchanged. Updates preserve D1 provenance; original HTTP responses are not included. Source completion, ingestion, export and merge are separate evidence.\n\nValidation: complete archive schema, hashes, ordering and counts checked before publication.\n`
        yield* Effect.tryPromise({ try: () => writeFile(bodyFile, body), catch: () => new ArchiveSyncError({ category: 'staging', message: 'cannot write PR body' }) })
        if (changed) {
          yield* git(['add', '--', `${archivePath}/updates`], checkout)
          const staged = (yield* git(['diff', '--cached', '--name-only'], checkout)).trim().split('\n').filter(Boolean)
          if (staged.some((name) => !permitted(name))) return yield* reject('unexpected_staged_path')
          yield* git(['-c', 'user.name=monitor-pangan archive bot', '-c', 'user.email=archive@monitor-pangan.invalid', 'commit', '-m', 'data: synchronize PIHPS observations'], checkout)
          yield* git(['push', `--force-with-lease=refs/heads/${branch}:${previousSha}`, 'origin', `HEAD:refs/heads/${branch}`], checkout)
        }
        let publishedPr = pr?.state === 'OPEN' ? pr : null
        let createdPr = false
        if (!publishedPr && (changed || hasPendingBranch)) {
          publishedPr = yield* host.create(bodyFile)
          if (!publishedPr) return yield* reject('pr_creation_unconfirmed')
          createdPr = true
        }
        else if (publishedPr && changed) yield* host.update(publishedPr, bodyFile)
        return { ...result, outcome: changed || createdPr ? 'published' : 'unchanged', prUrl: publishedPr?.url ?? null,
          archiveHash: hashText(JSON.stringify((yield* readHistory(directory)).updates.manifest)) }
      }).pipe(Effect.ensuring(git(['worktree', 'remove', '--force', checkout]).pipe(Effect.ignore)))
    }),
    (temporary) => Effect.promise(() => rm(temporary, { recursive: true, force: true })),
  )
})
