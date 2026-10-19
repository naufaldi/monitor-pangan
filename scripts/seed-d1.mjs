import { Effect, Schema } from 'effect'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { dirname } from 'node:path'
import { derivedObservations, rawObservations, snapshotObservations, planImport, validateRange, RecoveryManifestSchema, ProvenanceSchema, ExistingCoverageSchema } from './price-import.mjs'
import { ArchiveError, io, readRaw, timestamp } from './pihps-scrape.mjs'
import { tradingDaysFromThrough } from '../src/lib/civil-date.ts'
import { readHistory } from './pihps-history-files.mjs'
import { historyObservations } from './pihps-history.mjs'

const args = process.argv.slice(2)
const option = (key) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1] }
const jsonFile = (path) => io(() => readFile(path, 'utf8')).pipe(Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))))
Effect.runPromise(Effect.gen(function* () {
  const from = option('--from'), to = option('--to'), target = option('--target'), output = option('--out')
  validateRange(from, to)
  if (!['local', 'remote'].includes(target) || !args.includes('--dry-run') || !output) return yield* Effect.fail(new ArchiveError({ message: 'required: --target local|remote --dry-run --out <sql-path>; generator never applies SQL' }))
  const baselineJson = option('--existing-json'), baselineDb = option('--existing-db')
  if (Boolean(baselineJson) === Boolean(baselineDb)) return yield* Effect.fail(new ArchiveError({ message: 'provide exactly one --existing-json <Wrangler SELECT export> or --existing-db <SQLite file>' }))
  let existing, existingCoverage = [], baselineSha256
  if (baselineJson) {
    const text = yield* io(() => readFile(baselineJson, 'utf8'))
    baselineSha256 = createHash('sha256').update(text).digest('hex')
    const query = yield* Schema.decodeUnknown(Schema.parseJson(Schema.Array(Schema.Struct({ success: Schema.Literal(true), results: Schema.Array(Schema.Unknown) }))))(text)
    if (query.length !== 1) return yield* Effect.fail(new ArchiveError({ message: 'existing JSON must contain exactly one complete SELECT * FROM prices_daily result' }))
    existing = query[0].results
    if (option('--coverage-json')) {
      const coverage = yield* jsonFile(option('--coverage-json')).pipe(Effect.flatMap(Schema.decodeUnknown(Schema.Array(Schema.Struct({ success: Schema.Literal(true), results: ExistingCoverageSchema })))))
      existingCoverage = coverage[0].results.filter((r) => r.source_id === 'pihps')
    }
  } else {
    const db = yield* Effect.try({ try: () => new DatabaseSync(baselineDb, { readOnly: true }), catch: (cause) => new ArchiveError({ message: String(cause) }) })
    const out = yield* Effect.try({ try: () => ({ prices: db.prepare('SELECT * FROM prices_daily').all(), days: db.prepare("SELECT * FROM source_days WHERE source_id='pihps'").all() }), catch: (cause) => new ArchiveError({ message: String(cause) }) }).pipe(Effect.ensuring(Effect.sync(() => db.close())))
    existing = out.prices; existingCoverage = out.days
  }
  const observations = [], coverage = [], inputs = []
  const inputDir = option('--input-dir'), rawDir = option('--raw-dir'), historyDir = option('--history-dir')
  const yearArg = args.find((s) => /^\d{4}$/.test(s))
  if ([inputDir, rawDir, historyDir, option('--snapshot'), yearArg].filter(Boolean).length > 1) {
    return yield* Effect.fail(new ArchiveError({ message: 'choose exactly one history, derived, raw or snapshot input' }))
  }
  if (historyDir) {
    const archive = yield* readHistory(historyDir)
    if (from < archive.manifest.range.from || to > archive.manifest.range.to) return yield* Effect.fail(new ArchiveError({ message: 'repository history import must stay inside audited 2017-03-27..2026-09-15 range' }))
    for (const observation of historyObservations(archive)) {
      if (observation.date >= from && observation.date <= to) observations.push(observation)
    }
    inputs.push(...archive.manifest.years.map((year) => ({ path: `${historyDir}/${year.file}`, sha256: year.sha256, raw_ref: `git:${archive.manifest.source.commit}:${year.provenance.path}` })))
  } else if (inputDir) {
    const provenance = yield* jsonFile(`${inputDir}/provenance.json`).pipe(Effect.flatMap(Schema.decodeUnknown(ProvenanceSchema)))
    const manifest = yield* jsonFile('docs/qa/pr12/repair-manifest.json').pipe(Effect.flatMap(Schema.decodeUnknown(RecoveryManifestSchema)))
    if (from < manifest.repairRange.from || to > manifest.repairRange.to) return yield* Effect.fail(new ArchiveError({ message: 'derived archive import must stay inside audited 2017-03-27..2026-09-15 range' }))
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
      const path = `${inputDir}/${year}.json`
      const text = yield* io(() => readFile(path, 'utf8'))
      const sha256 = createHash('sha256').update(text).digest('hex')
      if (manifest.years.find((y) => y.year === year)?.sha256 !== sha256) return yield* Effect.fail(new ArchiveError({ message: `hash mismatch ${path}` }))
      const raw_ref = `git:${provenance.sourceCommit}:public/series/${year}.json`
      const doc = yield* Schema.decodeUnknown(Schema.parseJson(Schema.Unknown))(text)
      observations.push(...(yield* derivedObservations(doc, raw_ref)))
      inputs.push({ path, sha256, raw_ref })
    }
  } else if (rawDir) {
    for (const file of (yield* io(() => readdir(rawDir))).filter((f) => /^pihps-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
      const date = file.slice(6, 16)
      if (date < from || date > to) continue
      const parsed = yield* rawObservations(yield* readRaw(`${rawDir}/${file}`), `${rawDir}/${file}`)
      observations.push(...parsed.observations); coverage.push(parsed.coverage)
      inputs.push({ path: `${rawDir}/${file}` })
    }
  } else {
    const year = args.find((s) => /^\d{4}$/.test(s))
    const path = option('--snapshot') ?? (year ? `data/snapshots/${year}.json` : 'data/snapshots/latest.json')
    observations.push(...snapshotObservations(yield* jsonFile(path), path)); inputs.push({ path })
    // Snapshot prices alone carry no independently verified scope completion.
  }
  if (coverage.some((d) => d.verified) && baselineJson && !option('--coverage-json')) return yield* Effect.fail(new ArchiveError({ message: 'verified raw input requires --coverage-json for exact coverage-change counts with a price export' }))
  const plan = yield* Effect.try({ try: () => planImport({ from, to, observations, existing, coverage, existingCoverage }), catch: (cause) => new ArchiveError({ message: String(cause) }) })
  const dates = new Set(observations.filter((r) => r.date >= from && r.date <= to).map((r) => r.date))
  const unknownWeekdays = tradingDaysFromThrough(from, to).filter((d) => !dates.has(d) && !coverage.some((c) => c.iso === d && c.verified))
  const report = { ...plan.report, generatedAt: yield* timestamp, target, applied: false, baseline: baselineJson ?? baselineDb, baselineSha256, baselineCoverageKnown: Boolean(baselineDb || option('--coverage-json')),
    baselineLimit: baselineJson ? 'Static SELECT export: regenerate immediately before applying; runtime guard rejects non-PIHPS key collisions. Coverage counts require --coverage-json.' : 'Read-only local SQLite snapshot; concurrent writes after planning are not included.',
    inputs, unknownWeekdays, observedDates: dates.size, unverifiedObservedDates: [...dates].filter((date) => !coverage.some((d) => d.iso === date && d.verified)).length,
    coverageEvidence: inputDir || historyDir ? 'Derived observations only: original HTTP scopes are unknown for every imported date.' : 'Only original raw scopes with successful responses and no preserved fallback cells establish completion.',
    newestVerifiedLiveDate: coverage.filter((d) => d.verified && d.liveCells > 0).map((d) => d.iso).sort().at(-1) ?? null,
    sqlSha256: createHash('sha256').update(plan.sql).digest('hex') }
  yield* io(() => mkdir(dirname(output), { recursive: true }))
  yield* io(() => writeFile(`${output}.report.json`, JSON.stringify(report, null, 2)))
  yield* io(() => writeFile(output, plan.sql))
  console.log(JSON.stringify({ sql: output, report: `${output}.report.json`, inserts: report.inserts, updates: report.updates, unchanged: report.unchanged, preserved: report.existingPreserved, coverageChanges: report.coverageChanges, unresolvedErrors: report.unresolvedErrors.length, unknownWeekdays: unknownWeekdays.length }))
})).catch((error) => { console.error(String(error)); process.exitCode = 1 })
