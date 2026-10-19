import { Effect } from 'effect'
import { tradingDaysFromThrough } from '../src/lib/civil-date.ts'
import { scrapeDates, timestamp, writeJsonAtomic } from './pihps-scrape.mjs'
import { validateRange } from './price-import.mjs'

const program = Effect.gen(function* () {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const year = args.find((s) => /^\d{4}$/.test(s))
  const dates = args.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  const today = (yield* timestamp).slice(0, 10)
  const start = year ? `${year}-01-01` : dates[0] ?? today
  const end = year ? (year === today.slice(0, 4) ? today : `${year}-12-31`) : dates[1] ?? start
  validateRange(start, end)
  const work = tradingDaysFromThrough(start, end)
  const manifest = { year, startedAt: yield* timestamp, dates: {} }
  const result = yield* scrapeDates(work, { force, onDate: (summary) => Effect.gen(function* () {
    manifest.dates[summary.iso] = summary
    manifest.updatedAt = yield* timestamp
    console.log(JSON.stringify(summary))
    if (year) yield* writeJsonAtomic(`data/raw/manifest-${year}.json`, manifest)
  }) })
  if (result.failed) process.exitCode = 1
})
Effect.runPromise(program).catch((error) => { console.error(String(error)); process.exitCode = 1 })
