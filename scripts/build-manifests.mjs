import { Effect } from 'effect'
import { readdir } from 'node:fs/promises'
import { io, readRaw, summarizeRaw, timestamp, writeJsonAtomic } from './pihps-scrape.mjs'

Effect.runPromise(Effect.gen(function* () {
  const files = (yield* io(() => readdir('data/raw'))).filter((f) => /^pihps-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  const years = new Map()
  for (const file of files) {
    const raw = yield* readRaw(`data/raw/${file}`)
    const year = raw.date.slice(0, 4)
    if (!years.has(year)) years.set(year, { year, startedAt: yield* timestamp, dates: {} })
    years.get(year).dates[raw.date] = summarizeRaw(raw)
  }
  for (const [year, manifest] of years) {
    manifest.updatedAt = yield* timestamp
    yield* writeJsonAtomic(`data/raw/manifest-${year}.json`, manifest)
    console.log(`year ${year}: dates=${Object.keys(manifest.dates).length}`)
  }
})).catch((error) => { console.error(String(error)); process.exitCode = 1 })
