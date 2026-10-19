import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { cp, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sqliteFixture } from '../src/worker/sqlite-test.ts'
import { CAPTURE_ARCHIVE_DAY_SQL } from '../src/worker/archive-outbox.ts'
import { sqliteQuery } from './pihps-history-sync.mjs'
import { command, publishArchiveUpdate } from './pihps-history-publish.mjs'

it.live('a real Git remote gets one focused update and unchanged replay creates no second commit', () => Effect.acquireUseRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), 'pihps-publisher-'))),
  (root) => Effect.gen(function* () {
    const repo = join(root, 'repo'), remote = join(root, 'remote.git')
    yield* Effect.promise(() => mkdir(repo))
    const git = (args) => command('git', args, { cwd: repo })
    yield* git(['init', '-b', 'main'])
    yield* git(['config', 'user.email', 'fixture@example.invalid'])
    yield* git(['config', 'user.name', 'Fixture'])
    yield* Effect.promise(() => cp('data/history/pihps', join(repo, 'data/history/pihps'), { recursive: true }))
    yield* git(['add', '.']); yield* git(['commit', '-m', 'base'])
    yield* command('git', ['init', '--bare', remote])
    yield* git(['remote', 'add', 'origin', remote]); yield* git(['push', 'origin', 'main'])
    const { sqlite, price } = yield* sqliteFixture
    yield* price('2026-10-19', '31', 16000)
    sqlite.prepare(CAPTURE_ARCHIVE_DAY_SQL).run(JSON.stringify({ date: '2026-10-19', checkedAt: '2026-10-19T10:15:00Z', kind: 'd1_reconciliation' }))
    let pr = null
    const host = { find: () => Effect.succeed(pr), create: () => Effect.sync(() => { pr = { state: 'OPEN', author: { login: 'archive[bot]' }, url: 'https://github.com/fixture/repo/pull/1', number: 1, mergedAt: null }; return pr }), update: () => Effect.void }
    const options = { root: repo, query: sqliteQuery(sqlite), host, botLogin: 'archive[bot]' }
    assert.strictEqual((yield* publishArchiveUpdate(options)).outcome, 'published')
    const first = (yield* git(['ls-remote', 'origin', 'refs/heads/automation/pihps-history'])).trim()
    assert.strictEqual((yield* publishArchiveUpdate(options)).outcome, 'unchanged')
    assert.strictEqual((yield* git(['ls-remote', 'origin', 'refs/heads/automation/pihps-history'])).trim(), first)
    const names = (yield* git(['diff', '--name-only', 'origin/main...origin/automation/pihps-history'])).trim().split('\n')
    assert.deepStrictEqual(names, ['data/history/pihps/updates/2026.jsonl', 'data/history/pihps/updates/manifest.json'])
    // Squash/merge has advanced main; a new export branch can outlive a failed PR creation.
    yield* git(['merge', '--ff-only', 'origin/automation/pihps-history'])
    yield* git(['push', 'origin', 'main'])
    pr = { ...pr, state: 'MERGED', mergedAt: '2026-10-19T10:30:00Z' }
    for (const [date, value] of [['2026-10-20', 17000], ['2026-10-21', 18000]]) {
      yield* price(date, '31', value)
      sqlite.prepare(CAPTURE_ARCHIVE_DAY_SQL).run(JSON.stringify({ date, checkedAt: '2026-10-21T10:15:00Z', kind: 'd1_reconciliation' }))
    }
    const unavailableHost = { ...host, create: () => Effect.fail(new Error('GitHub unavailable after push')) }
    assert.strictEqual((yield* Effect.either(publishArchiveUpdate({ ...options, host: unavailableHost })))._tag, 'Left')
    const pushed = (yield* git(['ls-remote', 'origin', 'refs/heads/automation/pihps-history'])).trim()
    const retry = yield* publishArchiveUpdate({ ...options, maxEvents: 1 })
    assert.strictEqual(retry.outcome, 'published')
    assert.strictEqual((yield* git(['ls-remote', 'origin', 'refs/heads/automation/pihps-history'])).trim(), pushed)
    const pending = JSON.parse(yield* git(['show', 'origin/automation/pihps-history:data/history/pihps/updates/manifest.json']))
    assert.strictEqual(pending.throughSequence, 3)
    yield* price('2026-10-22', '31', 19000)
    sqlite.prepare(CAPTURE_ARCHIVE_DAY_SQL).run(JSON.stringify({ date: '2026-10-22', checkedAt: '2026-10-22T10:15:00Z', kind: 'd1_reconciliation' }))
    const oldHead = (yield* git(['rev-parse', 'origin/automation/pihps-history'])).trim()
    const tree = (yield* git(['rev-parse', 'origin/automation/pihps-history^{tree}'])).trim()
    const competitor = (yield* git(['commit-tree', tree, '-p', oldHead, '-m', 'competing archive publication'])).trim()
    let raced = false
    const localQuery = sqliteQuery(sqlite)
    const racingQuery = (sql, params) => localQuery(sql, params).pipe(Effect.tap(() => {
      if (!raced && sql.startsWith('SELECT seq,')) {
        raced = true
        return git(['push', 'origin', `${competitor}:refs/heads/automation/pihps-history`])
      }
      return Effect.void
    }))
    assert.strictEqual((yield* Effect.either(publishArchiveUpdate({ ...options, query: racingQuery })))._tag, 'Left')
    assert.ok((yield* git(['ls-remote', 'origin', 'refs/heads/automation/pihps-history'])).startsWith(competitor))
    assert.strictEqual((yield* publishArchiveUpdate(options)).throughSequence, 4)
    pr = { ...pr, state: 'CLOSED' }
    assert.strictEqual((yield* Effect.flip(publishArchiveUpdate(options))).category, 'closed_unmerged_pr')
  }),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
), 60000)
