import { Effect, Schema } from 'effect'
import { createHash } from 'node:crypto'
import audit from '../docs/qa/pr12/repair-manifest.json' with { type: 'json' }
import { COMMODITY_ROWS, REGION_ROWS } from '../src/data/pihps-catalog.ts'
import { isTradingDay, tradingDaysFromThrough } from '../src/lib/civil-date.ts'
import { ArchiveError, DateSchema } from './pihps-scrape.mjs'
import { observationsFromSeries } from './price-import.mjs'

export const SOURCE_COMMIT = 'ef85f27904b044bd343a56dcdd77a46d28eb1205'
export const RANGE = { from: '2017-03-27', to: '2026-09-15' }
export const AUDIT_YEARS = audit.years
const commodities = COMMODITY_ROWS.map(([id]) => id).sort()
const regions = REGION_ROWS.map(([code]) => code).sort()
const Price = Schema.Number.pipe(Schema.finite(), Schema.int(), Schema.positive())
const YearSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  year: Schema.Literal(...AUDIT_YEARS.map(({ year }) => year)),
  dates: Schema.Array(DateSchema).pipe(Schema.minItems(1)),
  values: Schema.Struct(Object.fromEntries(commodities.map((id) => [id,
    Schema.Struct(Object.fromEntries(regions.map((code) => [code, Schema.Array(Schema.NullOr(Price))]))),
  ]))),
}).pipe(Schema.filter((doc) =>
  doc.dates.every((date, i) => date.startsWith(`${doc.year}-`) && isTradingDay(date) &&
    date >= RANGE.from && date <= RANGE.to && (i === 0 || date > doc.dates[i - 1])) &&
  commodities.every((id) => regions.every((code) => doc.values[id][code].length === doc.dates.length)),
  { message: () => 'dates must be unique sorted audited weekdays; every provincial series must match their length' }))

export const decodeYear = Schema.decodeUnknown(YearSchema, { onExcessProperty: 'error' })
export const sha256 = (text) => createHash('sha256').update(text).digest('hex')
export const sourceRef = (year) => `git:${SOURCE_COMMIT}:public/series/${year}.json`
export const historyObservations = ({ years }) => years.flatMap((doc) => observationsFromSeries(doc, sourceRef(doc.year)))

/** One provincial array per line keeps yearly diffs readable without repeating observation keys. */
export const serializeYear = (doc) => {
  const values = commodities.map((id) => `    ${JSON.stringify(id)}: {\n${regions.map((code) =>
    `      ${JSON.stringify(code)}: ${JSON.stringify(doc.values[id][code])}`).join(',\n')}\n    }`).join(',\n')
  return `{\n  "schemaVersion": 1,\n  "year": ${doc.year},\n  "dates": ${JSON.stringify(doc.dates)},\n  "values": {\n${values}\n  }\n}\n`
}
export const serializeManifest = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`

const statistics = (doc) => {
  let observations = 0, nullCells = 0
  for (const id of commodities) for (const code of regions) for (const price of doc.values[id][code]) {
    if (price === null) nullCells++
    else observations++
  }
  return { dates: doc.dates.length, observations, nullCells }
}

/** Recompute every manifest field; its identity and source hashes come from the reviewed #36 audit. */
export const makeManifest = (years) => {
  const entries = years.map((doc) => {
    const text = serializeYear(doc)
    return { year: doc.year, file: `${doc.year}.json`, sha256: sha256(text), bytes: Buffer.byteLength(text),
      from: doc.dates[0], to: doc.dates.at(-1), ...statistics(doc),
      provenance: { path: `public/series/${doc.year}.json`, sha256: AUDIT_YEARS.find((y) => y.year === doc.year).sha256 } }
  })
  const dates = years.flatMap((y) => y.dates)
  const observed = new Set(dates)
  return { schemaVersion: 1, source: { id: 'pihps', level: 'eceran', kind: 'derived-year-series',
    commit: SOURCE_COMMIT, originalHttpResponses: false, sourceCompletionEvidence: 'unknown' },
    range: RANGE,
    counts: { dates: dates.length, observations: entries.reduce((n, y) => n + y.observations, 0),
      nullCells: entries.reduce((n, y) => n + y.nullCells, 0) },
    unknownWeekdays: tradingDaysFromThrough(RANGE.from, RANGE.to).filter((date) => !observed.has(date)),
    years: entries }
}

export const archiveFiles = (years) => {
  const files = new Map(years.map((year) => [`${year.year}.json`, serializeYear(year)]))
  files.set('manifest.json', serializeManifest(makeManifest(years)))
  return files
}

export const validateAudit = (years) => Effect.gen(function* () {
  const dates = years.flatMap((year) => year.dates)
  const manifest = makeManifest(years)
  const expectedCounts = AUDIT_YEARS.map((year) => year.year === 2026
    ? audit.proposedProvincialCells - AUDIT_YEARS.filter((y) => y.year < 2026).reduce((n, y) => n + y.cells, 0)
    : year.cells)
  if (JSON.stringify(years.map((y) => y.year)) !== JSON.stringify(AUDIT_YEARS.map((y) => y.year)) ||
      JSON.stringify(dates) !== JSON.stringify(audit.repairDates) ||
      manifest.years.some((year, i) => year.observations !== expectedCounts[i]) ||
      manifest.counts.observations !== 791426 || manifest.counts.nullCells !== 139194) {
    return yield* Effect.fail(new ArchiveError({ message: 'archive differs from the audited years, dates or provincial counts' }))
  }
  return manifest
})
