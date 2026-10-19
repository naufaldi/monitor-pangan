// Controlled local fixture only. Never fetches PIHPS, accesses remote D1 or overwrites a database.
import { Clock, Effect, Layer } from 'effect'
import { DatabaseSync } from 'node:sqlite'
import { cp, mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { d1PriceStoreLayer } from '../../../src/worker/d1-store.ts'
import { PihpsSource } from '../../../src/worker/ingest.ts'
import { handleScheduled } from '../../../src/worker/index.ts'
import { tradingDaysFromThrough } from '../../../src/lib/civil-date.ts'
import { readHistory } from '../../../scripts/pihps-history-files.mjs'
import { historyObservations } from '../../../scripts/pihps-history.mjs'
import { planImport } from '../../../scripts/price-import.mjs'
import { syncArchive, sqliteQuery } from '../../../scripts/pihps-history-sync.mjs'
import { io } from '../../../scripts/pihps-scrape.mjs'

const root = 'data/repairs/issue-38'
const program = Effect.gen(function* () {
  yield* io(() => mkdir(root, { recursive: true }))
  const database = join(root, 'source.sqlite')
  const reserved = yield* io(() => open(database, 'wx'))
  yield* io(() => reserved.close())
  const sqlite = yield* Effect.sync(() => new DatabaseSync(database))
  const prepare = (sql, params = []) => ({ bind: (...bound) => prepare(sql, bound),
    all: () => Promise.resolve({ results: sqlite.prepare(sql).all(...params) }),
    run: () => Promise.resolve({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }) })
  const db = { prepare, exec: (sql) => Promise.resolve(sqlite.exec(sql)), batch: (statements) => {
    sqlite.exec('BEGIN')
    return Promise.all(statements.map((statement) => Promise.resolve().then(() => statement.run()))).then(
      (results) => { sqlite.exec('COMMIT'); return results }, (error) => { sqlite.exec('ROLLBACK'); return Promise.reject(error) })
  } }
  let ready = false, sourceRequests = 0
  const source = Layer.succeed(PihpsSource, { fetchGrid: () => Effect.sync(() => {
    sourceRequests++
    return { data: ready ? [{ name: 'Beras', level: 1, '19/10/2026': '16,000' }] : [] }
  }) })
  const millis = 1792401300000
  const clock = { ...Clock.make(), unsafeCurrentTimeMillis: () => millis,
    currentTimeMillis: Effect.succeed(millis), unsafeCurrentTimeNanos: () => BigInt(millis) * 1000000n,
    currentTimeNanos: Effect.succeed(BigInt(millis) * 1000000n) }
  // Initialize through the production adapter before setting controlled earlier coverage.
  const { ensureMigrated } = yield* Effect.promise(() => import('../../../src/worker/d1-store.ts'))
  yield* ensureMigrated(db)
  for (const date of tradingDaysFromThrough('2026-09-17', '2026-10-16')) {
    sqlite.prepare("INSERT INTO source_days VALUES (?,'pihps','empty','2026-10-19T00:00:00Z')").run(date)
  }
  const scheduled = handleScheduled().pipe(Effect.provide(Layer.mergeAll(d1PriceStoreLayer(db), source)), Effect.withClock(clock))
  yield* scheduled
  ready = true
  yield* scheduled
  const directory = join(root, 'archive')
  yield* io(() => cp('data/history/pihps', directory, { recursive: true }))
  const exported = yield* syncArchive({ directory, query: sqliteQuery(sqlite) })
  const repeated = yield* syncArchive({ directory, query: sqliteQuery(sqlite) })
  const archive = yield* readHistory(directory)
  const selected = new Set(['2018-10-09', '2025-10-30', '2026-10-19'])
  const observations = historyObservations(archive).filter((row) => selected.has(row.date))
  const importPlan = planImport({ from: '2018-10-09', to: '2026-10-19', observations, existing: [], coverage: [], existingCoverage: [] })
  yield* io(() => writeFile(join(root, 'restore.local.sql'), importPlan.sql))
  const evidence = { target: 'controlled-local-fixture', sourceRequests, jobs: sqlite.prepare('SELECT status,rows_upserted FROM job_runs ORDER BY id').all(),
    outboxEvents: sqlite.prepare('SELECT COUNT(*) AS n FROM pihps_archive_events').get().n, exported, repeated,
    restoration: importPlan.report, dates: [...selected] }
  yield* io(() => writeFile(join(root, 'flow.json'), JSON.stringify(evidence, null, 2) + '\n'))
  console.log(JSON.stringify(evidence))
  sqlite.close()
})
Effect.runPromise(program).catch((error) => { console.error(String(error)); process.exitCode = 1 })
