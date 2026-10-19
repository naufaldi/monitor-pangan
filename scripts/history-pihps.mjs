import { Effect } from 'effect'
import { ArchiveError } from './pihps-scrape.mjs'
import { readHistory, buildHistory, rebuildHistory } from './pihps-history-files.mjs'

const [command, ...args] = process.argv.slice(2)
Effect.runPromise(Effect.gen(function* () {
  let manifest
  if (command === 'validate' && args.length <= 1) manifest = (yield* readHistory(args[0])).manifest
  else if (command === 'rebuild' && args.length <= 1) manifest = yield* rebuildHistory(args[0])
  else if (command === 'build' && args.length >= 1 && args.length <= 2) manifest = yield* buildHistory(args[0], args[1])
  else return yield* Effect.fail(new ArchiveError({ message: 'usage: history-pihps.mjs validate|rebuild [directory] or build <recovered-input-directory> [output-directory]' }))
  console.log(JSON.stringify({ command, range: manifest.range, ...manifest.counts, unknownWeekdays: manifest.unknownWeekdays.length }))
})).catch((error) => { console.error(String(error)); process.exitCode = 1 })
