import { Effect, Schema } from 'effect'
import { createHash } from 'node:crypto'
import { readFile, readdir, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { ArchiveEventSchema } from '../src/worker/archive-outbox.ts'
import { ArchiveError, io } from './pihps-scrape.mjs'

export const hashText = (text) => createHash('sha256').update(text).digest('hex')
const serializeManifest = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`
const decodeEvent = Schema.decodeUnknown(ArchiveEventSchema, { onExcessProperty: 'error' })
const json = Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))
export const mergeArchiveEvents = (existing, incoming) => {
  const events = new Map()
  for (const event of [...existing, ...incoming]) {
    const old = events.get(event.sequence)
    if (old && JSON.stringify(old) !== JSON.stringify(event)) throw new ArchiveError({ message: 'conflicting event replay' })
    events.set(event.sequence, event)
  }
  return [...events.values()].sort((a, b) => a.sequence - b.sequence)
}

export const updateArchiveFiles = (input, baseManifestSha256) => Effect.gen(function* () {
  const events = yield* Effect.forEach(input, decodeEvent)
  if (events.some((event, i) => event.epoch !== events[0].epoch || (i > 0 && event.sequence <= events[i - 1].sequence))) {
    return yield* Effect.fail(new ArchiveError({ message: 'update events require one epoch and increasing unique sequences' }))
  }
  const files = new Map(), years = []
  for (const year of [...new Set(events.map((event) => event.date.slice(0, 4)))].sort()) {
    const selected = events.filter((event) => event.date.startsWith(`${year}-`))
    const text = selected.map((event) => JSON.stringify(event)).join('\n') + '\n'
    files.set(`updates/${year}.jsonl`, text)
    const dates = selected.map((event) => event.date).sort()
    years.push({ file: `${year}.jsonl`, sha256: hashText(text), bytes: Buffer.byteLength(text), events: selected.length,
      observations: selected.reduce((count, event) => count + event.observations.length, 0), from: dates[0], to: dates.at(-1) })
  }
  const manifest = { schemaVersion: 1, baseManifestSha256, epoch: events[0]?.epoch ?? null,
    throughSequence: events.at(-1)?.sequence ?? 0, eventCount: events.length, years }
  files.set('updates/manifest.json', serializeManifest(manifest))
  return files
})

export const readUpdates = (directory, baseManifestSha256) => Effect.gen(function* () {
  const path = join(directory, 'updates')
  const stat = yield* io(() => lstat(path)).pipe(Effect.catchIf((e) => e.message.includes('ENOENT'), () => Effect.succeed(null)))
  if (stat === null) return { manifest: null, events: [] }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return yield* Effect.fail(new ArchiveError({ message: 'updates must be a regular directory' }))
  const names = yield* io(() => readdir(path))
  if (!names.includes('manifest.json') || names.some((name) => !/^(?:manifest\.json|\d{4}\.jsonl)$/.test(name))) {
    return yield* Effect.fail(new ArchiveError({ message: 'unexpected update file' }))
  }
  const actual = new Map(), events = []
  for (const name of names.sort()) {
    const file = join(path, name), metadata = yield* io(() => lstat(file))
    if (!metadata.isFile() || metadata.isSymbolicLink()) return yield* Effect.fail(new ArchiveError({ message: 'updates require regular files' }))
    const text = yield* io(() => readFile(file, 'utf8'))
    actual.set(`updates/${name}`, text)
    if (name === 'manifest.json') continue
    if (!text.endsWith('\n') || text === '\n') return yield* Effect.fail(new ArchiveError({ message: 'incomplete or empty update file' }))
    let previous = 0
    for (const line of text.slice(0, -1).split('\n')) {
      const event = yield* json(line).pipe(Effect.flatMap(decodeEvent))
      if (!name.startsWith(event.date.slice(0, 4)) || event.sequence <= previous || JSON.stringify(event) !== line) {
        return yield* Effect.fail(new ArchiveError({ message: 'noncanonical update event order, year or bytes' }))
      }
      previous = event.sequence
      events.push(event)
    }
  }
  events.sort((a, b) => a.sequence - b.sequence)
  const expected = yield* updateArchiveFiles(events, baseManifestSha256)
  if (expected.size !== actual.size || [...expected].some(([name, text]) => actual.get(name) !== text)) {
    return yield* Effect.fail(new ArchiveError({ message: 'update manifest schema, epoch, hashes or counts mismatch' }))
  }
  return { manifest: yield* json(actual.get('updates/manifest.json')), events }
})

export const foldObservationUpdates = (baseRows, events = []) => {
  const key = (row) => `${row.date}:${row.commodity_id}:${row.region_code}:${row.level ?? 'eceran'}`
  const rows = new Map(baseRows.map((row) => [key(row), row]))
  for (const event of events) for (const [commodity_id, region_code, price, sourceRef] of event.observations) {
    const row = { date: event.date, commodity_id, region_code, level: 'eceran', price, source_id: 'pihps',
      raw_ref: sourceRef ?? `d1:pihps:${event.epoch}:${event.sequence}` }
    rows.set(key(row), row)
  }
  return [...rows.values()].sort((a, b) => key(a).localeCompare(key(b), 'en'))
}
