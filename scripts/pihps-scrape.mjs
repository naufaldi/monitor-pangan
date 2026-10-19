import { Clock, DateTime, Data, Effect, Option, Schema } from 'effect'
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BI_TO_KEMENDAGRI, COMMODITY_ROWS, GRUP_BY_PIHPS_NAME } from '../src/data/pihps-catalog.ts'
import { parsePihpsNumber } from '../src/data/pihps-grid.ts'
import { addIsoDays } from '../src/lib/civil-date.ts'

export class ArchiveError extends Data.TaggedError('ArchiveError') {}
export const io = (f) => Effect.tryPromise({ try: f, catch: (cause) => new ArchiveError({ message: String(cause) }) })
export const timestamp = Clock.currentTimeMillis.pipe(Effect.map((ms) => DateTime.formatIso(DateTime.unsafeMake(ms))))
export const DateSchema = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/), Schema.filter((s) => addIsoDays(s, 0) === s))
/** Raw writers use UTC ISO timestamps; accept whole seconds or canonical milliseconds only. */
export const SourceCheckTimestampSchema = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/),
  Schema.filter((value) => {
    const parsed = DateTime.make(value)
    const canonical = value.includes('.') ? value : value.replace('Z', '.000Z')
    return Option.isSome(parsed) && DateTime.formatIso(parsed.value) === canonical
  }),
)
const Price = Schema.Number.pipe(Schema.finite(), Schema.int(), Schema.positive())
const Prices = Schema.Struct(Object.fromEntries(COMMODITY_ROWS.map(([id]) => [id, Schema.optional(Schema.NullOr(Price))])))
const ScopeSchema = Schema.Struct({ province_id: Schema.String, region_code: Schema.NullOr(Schema.String), prices: Prices,
  status: Schema.optional(Schema.Literal('ok', 'source-empty', 'http-error')), preserved: Schema.optional(Schema.Boolean), error: Schema.optional(Schema.String), attempts: Schema.optional(Schema.Number) })
export const RawSchema = Schema.Struct({ date: DateSchema, source: Schema.Literal('pihps'), fetchedAt: SourceCheckTimestampSchema, rows: Schema.Array(ScopeSchema) }).pipe(Schema.filter((raw) =>
  new Set(raw.rows.map((r) => r.province_id)).size === raw.rows.length && raw.rows.every((r) => r.province_id === 'nasional' ? r.region_code === null : BI_TO_KEMENDAGRI[r.province_id] === r.region_code)))
const GridSchema = Schema.Struct({ data: Schema.Array(Schema.Struct({ name: Schema.String, level: Schema.Number }, Schema.Record({ key: Schema.String, value: Schema.Union(Schema.String, Schema.Number, Schema.Null) }))) })
export const SCOPES = [{ province_id: 'nasional', region_code: null }, ...Object.entries(BI_TO_KEMENDAGRI).map(([province_id, region_code]) => ({ province_id, region_code }))]
export const requestScope = (date, scope, options = {}) => Effect.gen(function* () {
  const fetcher = options.fetch ?? fetch
  const sleep = options.sleep ?? Effect.sleep
  const url = new URL('https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah')
  const params = { price_type_id: '1', tipe_laporan: '1', start_date: date, end_date: date }
  if (scope.province_id !== 'nasional') params.province_id = scope.province_id
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  let error = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = yield* io(() => fetcher(url, { headers: { Accept: 'application/json', Referer: 'https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah', 'User-Agent': 'monitor-pangan/0.1.0' } })).pipe(
      Effect.flatMap((res) => res.ok ? io(() => res.json()) : Effect.fail(new ArchiveError({ message: `HTTP ${res.status}` }))),
      Effect.flatMap(Schema.decodeUnknown(GridSchema)), Effect.either)
    if (result._tag === 'Right') {
      const prices = {}
      const [y, m, d] = date.split('-')
      for (const row of result.right.data) {
        const id = GRUP_BY_PIHPS_NAME[row.name]
        if (row.level === 1 && id) {
          const price = parsePihpsNumber(row[`${d}/${m}/${y}`])
          if (price != null && price > 0) prices[id] = price
        }
      }
      return { ...scope, status: Object.keys(prices).length > 0 ? 'ok' : 'source-empty', prices, attempts: attempt }
    }
    error = String(result.left)
    if (attempt < 3) yield* sleep(1500 * attempt)
  }
  return { ...scope, status: 'http-error', prices: {}, error, attempts: 3 }
})
export const preserveRaw = (fresh, previous) => {
  if (previous == null) return fresh
  if (fresh.date !== previous.date) throw new ArchiveError({ message: 'raw date mismatch' })
  const old = new Map(previous.rows.map((row) => [row.province_id, row]))
  const rows = fresh.rows.map((row) => {
    const prices = { ...row.prices }
    let preserved = row.preserved ?? false
    for (const [id, price] of Object.entries(old.get(row.province_id)?.prices ?? {})) {
      if (price != null && prices[id] == null) { prices[id] = price; preserved = true }
    }
    old.delete(row.province_id)
    return { ...row, prices, ...(preserved ? { preserved: true } : {}) }
  })
  for (const row of old.values()) rows.push({ ...row, status: 'http-error', preserved: true, error: 'scope omitted from retry' })
  return { ...fresh, rows }
}
export const scrapeDate = (date, options = {}) => Effect.gen(function* () {
  yield* Schema.decodeUnknown(DateSchema)(date)
  const rows = []
  for (const scope of options.scopes ?? SCOPES) {
    rows.push(yield* (options.request ?? requestScope)(date, scope))
    yield* (options.sleep ?? Effect.sleep)(300)
  }
  return preserveRaw({ date, source: 'pihps', fetchedAt: yield* timestamp, rows }, options.existing)
})
export const summarizeRaw = (raw, scopes = SCOPES) => {
  const liveCells = raw.rows.filter((r) => r.region_code != null).reduce((n, r) => n + Object.values(r.prices).filter((v) => v != null).length, 0)
  const failedScopes = raw.rows.filter((r) => r.status === 'http-error').length
  const complete = raw.rows.length === scopes.length && new Set(raw.rows.map((r) => r.province_id)).size === scopes.length && scopes.every((s) => raw.rows.some((r) => r.province_id === s.province_id && r.region_code === s.region_code))
  const verified = complete && raw.rows.every((r) => ['ok', 'source-empty'].includes(r.status) && !r.preserved)
  return { iso: raw.date, scopes: raw.rows.length, liveCells, failedScopes, verified,
    status: failedScopes > 0 ? (liveCells > 0 ? 'partial-error' : 'http-error') : verified ? (liveCells > 0 ? 'ok' : 'source-empty') : 'unknown', fetchedAt: raw.fetchedAt }
}
export const readRaw = (path) => io(() => readFile(path, 'utf8')).pipe(
  Effect.catchIf((e) => e.message.includes('ENOENT'), () => Effect.succeed(null)),
  Effect.flatMap((text) => text === null ? Effect.succeed(null) : Schema.decodeUnknown(Schema.parseJson(RawSchema))(text)),
  Effect.flatMap((raw) => {
    const fileDate = path.match(/pihps-(\d{4}-\d{2}-\d{2})\.json$/)?.[1]
    return raw && fileDate && raw.date !== fileDate ? Effect.fail(new ArchiveError({ message: `raw filename/date mismatch ${path}` })) : Effect.succeed(raw)
  }))
export const writeJsonAtomic = (path, value) => Effect.gen(function* () {
  yield* io(() => mkdir(dirname(path), { recursive: true }))
  const temporary = `${path}.${randomUUID()}.tmp`
  yield* io(() => writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' })).pipe(
    Effect.andThen(io(() => rename(temporary, path))),
    Effect.ensuring(io(() => rm(temporary, { force: true })).pipe(Effect.ignore)))
})
export const writeRawAtomic = (path, raw) => Effect.gen(function* () {
  const valid = yield* Schema.decodeUnknown(RawSchema)(raw)
  const previous = yield* readRaw(path)
  const merged = preserveRaw(valid, previous)
  yield* writeJsonAtomic(path, merged)
  return merged
})
export const normalizationReport = (raws, scopes = SCOPES) => {
  const dates = raws.map((raw) => summarizeRaw(raw, scopes)).sort((a, b) => a.iso.localeCompare(b.iso))
  return { dates, newestVerifiedLiveDate: dates.filter((d) => d.verified && d.liveCells > 0).at(-1)?.iso ?? null }
}
/** CLI orchestration only. Worker ingestion never uses the CLI outage cooldown. */
export const scrapeDates = (dates, options = {}) => Effect.gen(function* () {
  const summaries = []
  const sleep = options.sleep ?? Effect.sleep
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i], path = `data/raw/pihps-${date}.json`
    const existing = yield* (options.read ?? readRaw)(path)
    const skipped = Boolean(existing && !options.force)
    const raw = skipped ? existing : yield* scrapeDate(date, { existing, request: options.request, sleep }).pipe(Effect.flatMap((r) => (options.write ?? writeRawAtomic)(path, r)))
    const summary = { ...summarizeRaw(raw), skipped }
    summaries.push(summary)
    if (options.onDate) yield* options.onDate(summary)
    if (summary.failedScopes === SCOPES.length && !skipped && i < dates.length - 1) yield* sleep(60000)
  }
  return { summaries, failed: summaries.some((d) => d.failedScopes > 0) }
})
