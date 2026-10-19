// Read-only HTTP verification of the controlled local Worker fixture prepared by prepare-local.mjs.
import { Effect, Schema } from 'effect'
import { readFile, writeFile } from 'node:fs/promises'
import { CanonicalSnapshotSchema, TrendPageSchema } from '../../../src/data/price-schema.ts'
import { FreshPayloadSchema } from '../../../src/data/fresh-payload.ts'
import { io } from '../../../scripts/pihps-scrape.mjs'
import assert from 'node:assert/strict'

const origin = 'http://localhost:8798'
const get = (path, schema) => Effect.tryPromise({ try: () => fetch(`${origin}${path}`), catch: (error) => error }).pipe(
  Effect.flatMap((response) => response.ok ? Effect.tryPromise({ try: () => response.json(), catch: (error) => error }) : Effect.fail(new Error(`HTTP ${response.status}`))),
  Effect.flatMap(Schema.decodeUnknown(schema)),
)
const FixtureSchema = Schema.Struct({ rows: Schema.Array(Schema.Struct({ regionCode: Schema.String, price: Schema.NullOr(Schema.Number) })),
  expected: Schema.Struct({ nationalAvg: Schema.Number }) })
Effect.runPromise(Effect.gen(function* () {
  const fixtures = []
  for (const date of ['2018-10-09', '2025-10-30']) {
    const fixture = yield* io(() => readFile(`src/data/fixtures/pihps-${date}.json`, 'utf8')).pipe(Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(FixtureSchema))))
    const snapshot = yield* get(`/api/snapshot?date=${date}&commodity=beras`, CanonicalSnapshotSchema)
    assert.deepEqual(snapshot.rows, fixture.rows)
    assert.equal(snapshot.nationalAvg, fixture.expected.nationalAvg)
    assert.equal(snapshot.pricedCount, 34)
    fixtures.push({ date, rows: snapshot.rows.length, pricedCount: snapshot.pricedCount, nationalAvg: snapshot.nationalAvg })
  }
  const latest = yield* get('/api/snapshot?date=2026-10-19&commodity=beras', CanonicalSnapshotSchema)
  assert.equal(latest.nationalAvg, 16000)
  assert.equal(latest.pricedCount, 34)
  const fresh = yield* get('/api/pihps/fresh?after=2026-09-16', FreshPayloadSchema)
  assert.equal(fresh.latestDate, '2026-10-19')
  assert.equal(Object.keys(fresh.prices).length, 34)
  const trend = yield* get('/api/trend?commodity=beras&region=31&from=2018-10-09&to=2026-10-19&limit=1000', TrendPageSchema)
  assert.deepEqual(trend.national.map((row) => row.price), [11700, 15750, 16000])
  assert.equal(trend.selected.at(-1).price, 16000)
  assert.equal(trend.nextCursor, null)
  const evidence = { origin, target: 'controlled-local-Wrangler-D1', fixtures,
    latest: { date: latest.date, pricedCount: latest.pricedCount, nationalAvg: latest.nationalAvg },
    freshness: { latestDate: fresh.latestDate, observations: Object.keys(fresh.prices).length }, trend }
  yield* io(() => writeFile('docs/qa/issue-38/http-verification.json', `${JSON.stringify(evidence, null, 2)}\n`))
  console.log(JSON.stringify(evidence))
})).catch((error) => { console.error(String(error)); process.exitCode = 1 })
