import { DateTime, Effect, Schema } from 'effect'
import { COMMODITY_ROWS, REGION_ROWS } from '../src/data/pihps-catalog.ts'
import { isTradingDay } from '../src/lib/civil-date.ts'
import { ArchiveError, DateSchema, RawSchema, SourceCheckTimestampSchema, summarizeRaw } from './pihps-scrape.mjs'

const Price = Schema.Number.pipe(Schema.finite(), Schema.int(), Schema.positive())
const JAKARTA = DateTime.zoneUnsafeMakeNamed('Asia/Jakarta')
export const ObservationSchema = Schema.Struct({ date: DateSchema, commodity_id: Schema.Literal(...COMMODITY_ROWS.map(([id]) => id)),
  region_code: Schema.Literal(...REGION_ROWS.map(([code]) => code)), level: Schema.Literal('eceran'), price: Price,
  source_id: Schema.Literal('pihps'), raw_ref: Schema.optional(Schema.NullOr(Schema.String)) })
export const RecoveryManifestSchema = Schema.Struct({
  sourceCommit: Schema.Literal('ef85f27904b044bd343a56dcdd77a46d28eb1205'), kind: Schema.Literal('derived-year-series'),
  repairRange: Schema.Struct({ from: DateSchema, to: DateSchema }),
  years: Schema.Array(Schema.Struct({ year: Schema.Number.pipe(Schema.int()), sha256: Schema.String.pipe(Schema.pattern(/^[a-f0-9]{64}$/)) })),
})
export const ProvenanceSchema = Schema.Struct({ sourceCommit: Schema.Literal('ef85f27904b044bd343a56dcdd77a46d28eb1205'), kind: Schema.Literal('derived-year-series') })
export const ExistingCoverageSchema = Schema.Array(Schema.Struct({ date: DateSchema, source_id: Schema.String, status: Schema.Literal('live', 'empty', 'pending', 'error'), checked_at: Schema.String }))
const ExistingSchema = Schema.Array(Schema.Struct({ date: DateSchema, commodity_id: Schema.String, region_code: Schema.String,
  level: Schema.String, price: Schema.NullOr(Schema.Number), source_id: Schema.String, raw_ref: Schema.optional(Schema.NullOr(Schema.String)) }))
const DerivedSchema = Schema.Struct({ year: Schema.String, dates: Schema.Array(DateSchema),
  values: Schema.Record({ key: Schema.String, value: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.NullOr(Price)) }) }) }).pipe(Schema.filter((doc) =>
  doc.dates.length > 0 && doc.dates.every((d, i) => d.startsWith(`${doc.year}-`) && isTradingDay(d) && (i === 0 || d > doc.dates[i - 1])) &&
  Object.keys(doc.values).length === COMMODITY_ROWS.length && COMMODITY_ROWS.every(([id]) =>
    doc.values[id] && Object.keys(doc.values[id]).length === REGION_ROWS.length + 1 && [...REGION_ROWS.map(([code]) => code), 'nasional'].every((code) => doc.values[id][code]?.length === doc.dates.length))))
export const derivedObservations = (input, raw_ref) => Schema.decodeUnknown(DerivedSchema)(input).pipe(Effect.map((doc) => {
  const rows = []
  for (const [commodity_id] of COMMODITY_ROWS) for (const [region_code] of REGION_ROWS) for (let i = 0; i < doc.dates.length; i++) {
    const price = doc.values[commodity_id][region_code][i]
    if (price != null) rows.push({ date: doc.dates[i], commodity_id, region_code, level: 'eceran', price, source_id: 'pihps', raw_ref })
  }
  return rows
}))
export const snapshotObservations = (snap, raw_ref = 'snapshot') => {
  const parsed = Schema.decodeUnknownSync(Schema.Struct({ rows: Schema.Array(Schema.Unknown) }))(snap)
  return parsed.rows.filter((row) => row?.price != null).map((row) => Schema.decodeUnknownSync(ObservationSchema)({ ...row, raw_ref }))
}
export const rawObservations = (input, raw_ref) => Schema.decodeUnknown(RawSchema)(input).pipe(Effect.map((raw) => ({
  observations: raw.rows.filter((r) => r.region_code != null).flatMap((r) => Object.entries(r.prices).filter(([, price]) => price != null).map(([commodity_id, price]) => ({ date: raw.date, commodity_id, region_code: r.region_code, level: 'eceran', price, source_id: 'pihps', raw_ref }))),
  coverage: summarizeRaw(raw),
})))
export const quote = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`
const key = (r) => `${r.date}:${r.commodity_id}:${r.region_code}:${r.level}`
export const validateRange = (from, to) => {
  const result = Schema.decodeUnknownEither(Schema.Tuple(DateSchema, DateSchema))([from, to])
  if (result._tag === 'Left' || from > to || Number(to.slice(0, 4)) - Number(from.slice(0, 4)) > 10) throw new ArchiveError({ message: 'explicit valid inclusive range --from YYYY-MM-DD --to YYYY-MM-DD required (maximum 10 years)' })
}
/** No deletes or replacement updates: existing official observations win. Runtime conflict branch aborts a whole statement. */
export const planImport = ({ from, to, observations, existing, coverage = [], existingCoverage = [] }) => {
  validateRange(from, to)
  const rows = Schema.decodeUnknownSync(Schema.Array(ObservationSchema))(observations).filter((r) => r.date >= from && r.date <= to)
  const baseline = Schema.decodeUnknownSync(ExistingSchema)(existing)
  const before = new Map(baseline.map((r) => [key(r), r]))
  const unique = new Map()
  for (const row of rows) {
    const previous = unique.get(key(row))
    if (previous && previous.price !== row.price) throw new ArchiveError({ message: `input conflict ${key(row)}` })
    unique.set(key(row), row)
  }
  const report = { from, to, inputObservations: unique.size, inserts: 0, updates: 0, unchanged: 0, existingPreserved: baseline.length, differingOfficial: [], coverageChanges: 0, unresolvedErrors: [] }
  const sql = ['-- Bounded observation repair. Existing official values and newer dates are preserved.',
    '-- Runtime non-PIHPS conflict guard intentionally raises malformed JSON; regenerate the dry-run after a conflict.',
    `INSERT OR IGNORE INTO commodities (id,name,unit) VALUES ${COMMODITY_ROWS.map((r) => `(${r.map(quote).join(',')})`).join(',')};`,
    `INSERT OR IGNORE INTO regions (code,name,level) VALUES ${REGION_ROWS.map(([id, name]) => `(${quote(id)},${quote(name)},'province')`).join(',')};`]
  const prefix = 'INSERT INTO prices_daily (date,commodity_id,region_code,level,price,source_id,raw_ref) VALUES\n'
  const suffix = "\nON CONFLICT(date,commodity_id,region_code,level) DO UPDATE SET price=json_extract('archive_import_conflict','$') WHERE prices_daily.source_id <> 'pihps';"
  let values = []
  let bytes = Buffer.byteLength(prefix + suffix)
  const flush = () => { if (values.length) sql.push(prefix + values.join(',\n') + suffix); values = []; bytes = Buffer.byteLength(prefix + suffix) }
  for (const row of unique.values()) {
    const old = before.get(key(row))
    if (old && old.source_id !== 'pihps') throw new ArchiveError({ message: `non-PIHPS primary key conflict ${key(row)} (${old.source_id})` })
    if (!old) report.inserts++
    else if (old.price === row.price) report.unchanged++
    else report.differingOfficial.push({ key: key(row), existing: old.price, proposed: row.price })
    const value = `(${[row.date, row.commodity_id, row.region_code, row.level].map(quote).join(',')},${row.price},'pihps',${quote(row.raw_ref)})`
    if (bytes + Buffer.byteLength(value) + 2 > 90000) flush()
    values.push(value); bytes += Buffer.byteLength(value) + 2
  }
  flush()
  const markers = new Map(Schema.decodeUnknownSync(ExistingCoverageSchema)(existingCoverage).filter((r) => r.source_id === 'pihps').map((r) => [r.date, r]))
  for (const day of coverage.filter((d) => d.iso >= from && d.iso <= to)) {
    if (!day.verified) { report.unresolvedErrors.push(day); continue }
    const checkedAt = Schema.decodeUnknownSync(SourceCheckTimestampSchema)(day.fetchedAt)
    const checkedDate = DateTime.formatIsoDate(DateTime.setZone(DateTime.unsafeMake(checkedAt), JAKARTA))
    // Evidence never gets stronger merely because an old raw file is imported later.
    const status = day.liveCells > 0 ? 'live' : day.iso < checkedDate ? 'empty' : 'pending'
    const old = markers.get(day.iso)
    const incomingMillis = DateTime.unsafeMake(checkedAt).epochMillis
    const oldMillis = old ? DateTime.unsafeMake(Schema.decodeUnknownSync(SourceCheckTimestampSchema)(old.checked_at)).epochMillis : -Infinity
    // Completed evidence is monotonic; the check timestamp independently records the latest attempt.
    const nextStatus = old?.status === 'live' || status === 'live' ? 'live'
      : old?.status === 'empty' || status === 'empty' ? 'empty'
      : incomingMillis >= oldMillis ? status : old.status
    const nextCheckedAt = incomingMillis > oldMillis ? checkedAt : old.checked_at
    if (!old || old.status !== nextStatus || incomingMillis > oldMillis) report.coverageChanges++
    markers.set(day.iso, { date: day.iso, source_id: 'pihps', status: nextStatus, checked_at: nextCheckedAt })
    // julianday compares actual instants, including equivalent whole-second/.000Z representations.
    // The same guard runs against the current row, protecting evidence written after the dry run.
    const newer = 'julianday(excluded.checked_at)>julianday(source_days.checked_at)'
    const mergedStatus = `CASE WHEN source_days.status='live' OR excluded.status='live' THEN 'live'
      WHEN source_days.status='empty' OR excluded.status='empty' THEN 'empty'
      WHEN julianday(excluded.checked_at)>=julianday(source_days.checked_at) THEN excluded.status ELSE source_days.status END`
    sql.push(`INSERT INTO source_days (date,source_id,status,checked_at) VALUES (${quote(day.iso)},'pihps',${quote(status)},${quote(checkedAt)}) ON CONFLICT(date,source_id) DO UPDATE SET status=${mergedStatus},checked_at=CASE WHEN ${newer} THEN excluded.checked_at ELSE source_days.checked_at END WHERE ${newer} OR source_days.status<>(${mergedStatus});`)
  }
  report.existingPreserved = baseline.length - report.unchanged
  report.statements = sql.filter((s) => !s.startsWith('--')).length
  return { report, sql: sql.join('\n') + '\n' }
}
