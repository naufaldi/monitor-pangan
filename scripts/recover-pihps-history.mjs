import { Effect, Schema } from 'effect'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { derivedObservations, RecoveryManifestSchema } from './price-import.mjs'
import { ArchiveError, io, timestamp, writeJsonAtomic } from './pihps-scrape.mjs'

const run = promisify(execFile)
const COMMIT = 'ef85f27904b044bd343a56dcdd77a46d28eb1205'
Effect.runPromise(Effect.gen(function* () {
  const args = process.argv.slice(2)
  const out = args[args.indexOf('--out') + 1]
  if (!args.includes('--out') || !out?.startsWith('data/archive/')) return yield* Effect.fail(new ArchiveError({ message: 'use --out data/archive/<directory> (ignored local storage)' }))
  const manifest = yield* io(() => readFile('docs/qa/pr12/repair-manifest.json', 'utf8')).pipe(Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(RecoveryManifestSchema))))
  yield* io(() => mkdir(out, { recursive: true }))
  const files = []
  for (const { year, sha256 } of manifest.years) {
    const path = `public/series/${year}.json`
    const { stdout } = yield* io(() => run('git', ['show', `${COMMIT}:${path}`], { maxBuffer: 16 * 1024 * 1024 }))
    const actual = createHash('sha256').update(stdout).digest('hex')
    if (actual !== sha256) return yield* Effect.fail(new ArchiveError({ message: `hash mismatch ${path}` }))
    const rows = yield* io(() => Promise.resolve(JSON.parse(stdout))).pipe(Effect.flatMap((doc) => derivedObservations(doc, `git:${COMMIT}:${path}`)))
    yield* io(() => writeFile(`${out}/${year}.json`, stdout))
    files.push({ year, path, sha256, provincialCells: rows.length })
  }
  yield* writeJsonAtomic(`${out}/provenance.json`, { kind: 'derived-year-series', sourceCommit: COMMIT, recoveredAt: yield* timestamp, files })
  console.log(JSON.stringify({ out, files: files.length, sourceCommit: COMMIT }))
})).catch((error) => { console.error(String(error)); process.exitCode = 1 })
