import { Effect, Schema } from 'effect'
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { ArchiveError, io } from './pihps-scrape.mjs'
import { derivedObservations } from './price-import.mjs'
import { AUDIT_YEARS, decodeYear, archiveFiles, serializeYear, serializeManifest, sha256, validateAudit } from './pihps-history.mjs'

export { io }
const json = (text) => Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))(text)
const absent = (error) => error.message.includes('ENOENT')
const optionalRead = (path) => io(() => readFile(path, 'utf8')).pipe(Effect.catchIf(absent, () => Effect.succeed(null)))

export const readHistory = (directory = 'data/history/pihps') => Effect.gen(function* () {
  const allowed = new Set([...AUDIT_YEARS.map(({ year }) => `${year}.json`), 'manifest.json', 'README.md'])
  const names = yield* io(() => readdir(directory))
  if (names.some((name) => !allowed.has(name))) return yield* Effect.fail(new ArchiveError({ message: 'unexpected archive file' }))
  const years = []
  for (const { year } of AUDIT_YEARS) {
    const path = join(directory, `${year}.json`)
    const stat = yield* io(() => lstat(path))
    if (!stat.isFile()) return yield* Effect.fail(new ArchiveError({ message: `archive requires regular files: ${path}` }))
    const text = yield* io(() => readFile(path, 'utf8'))
    const doc = yield* json(text).pipe(Effect.flatMap(decodeYear))
    if (doc.year !== year || text !== serializeYear(doc)) return yield* Effect.fail(new ArchiveError({ message: `noncanonical archive ${path}` }))
    years.push(doc)
  }
  const manifest = yield* validateAudit(years)
  const text = yield* io(() => readFile(join(directory, 'manifest.json'), 'utf8'))
  // Parse JSON before the canonical byte comparison, which also rejects missing/extra fields and schema versions.
  yield* json(text)
  if (text !== serializeManifest(manifest)) return yield* Effect.fail(new ArchiveError({ message: 'manifest schema, hashes or statistics mismatch' }))
  return { manifest, years }
})

/** Exclusive writer, complete sibling staging, validate-before-rename and rollback on publication failure. */
export const publishHistory = (directory, files, validate = readHistory) => Effect.gen(function* () {
  const destination = resolve(directory)
  yield* io(() => mkdir(dirname(destination), { recursive: true }))
  return yield* Effect.acquireUseRelease(
    io(() => open(`${destination}.lock`, 'wx')),
    () => Effect.acquireUseRelease(
      io(() => mkdtemp(`${destination}.stage-`)),
      (stage) => Effect.gen(function* () {
        for (const [name, text] of files) {
          if (!/^(?:\d{4}\.json|manifest\.json|README\.md)$/.test(name)) return yield* Effect.fail(new ArchiveError({ message: 'invalid publication filename' }))
          yield* io(() => writeFile(join(stage, name), text, { flag: 'wx' }))
        }
        yield* validate(stage)
        const backup = `${stage}.previous`
        const moved = yield* io(() => rename(destination, backup)).pipe(Effect.as(true), Effect.catchIf(absent, () => Effect.succeed(false)))
        // Do not allow interruption between moving the old directory and installing/restoring its replacement.
        const installed = yield* io(() => rename(stage, destination)).pipe(Effect.either)
        if (installed._tag === 'Left') {
          if (moved) yield* io(() => rename(backup, destination))
          return yield* Effect.fail(installed.left)
        }
        if (moved) yield* io(() => rm(backup, { recursive: true }))
      }).pipe(Effect.uninterruptible),
      (stage) => io(() => rm(stage, { recursive: true, force: true })).pipe(Effect.orDie),
    ),
    (lock) => io(() => lock.close()).pipe(Effect.andThen(io(() => rm(`${destination}.lock`))), Effect.orDie),
  )
})

export const buildHistory = (input, output = 'data/history/pihps') => Effect.gen(function* () {
  const years = []
  for (const { year, sha256: expected } of AUDIT_YEARS) {
    const text = yield* io(() => readFile(join(input, `${year}.json`), 'utf8'))
    if (sha256(text) !== expected) return yield* Effect.fail(new ArchiveError({ message: `source hash mismatch ${year}` }))
    const doc = yield* json(text)
    yield* derivedObservations(doc, `public/series/${year}.json`)
    const indices = doc.dates.flatMap((date, i) => date >= '2017-03-27' && date <= '2026-09-15' ? [i] : [])
    const values = Object.fromEntries(Object.entries(doc.values).map(([id, regions]) => [id,
      Object.fromEntries(Object.entries(regions).filter(([code]) => code !== 'nasional').map(([code, prices]) => [code, indices.map((i) => prices[i])]))]))
    years.push(yield* decodeYear({ schemaVersion: 1, year, dates: indices.map((i) => doc.dates[i]), values }))
  }
  yield* validateAudit(years)
  const files = archiveFiles(years)
  const readme = yield* optionalRead(join(output, 'README.md'))
  if (readme !== null) files.set('README.md', readme)
  yield* publishHistory(output, files)
  return (yield* readHistory(output)).manifest
})

export const rebuildHistory = (directory = 'data/history/pihps') => Effect.gen(function* () {
  const { years, manifest } = yield* readHistory(directory)
  const files = archiveFiles(years)
  const readme = yield* optionalRead(join(directory, 'README.md'))
  if (readme !== null) files.set('README.md', readme)
  yield* publishHistory(directory, files)
  return manifest
})
