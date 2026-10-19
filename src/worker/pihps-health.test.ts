import { assert, it } from "@effect/vitest"
import { Effect, TestClock } from "effect"
import { handleRequest, workerLayer, type WorkerEnv } from "./index.ts"
import { sqliteFixture } from "./sqlite-test.ts"
import { tradingDaysFromThrough } from "../lib/civil-date.ts"
import { readFile } from "node:fs/promises"

const environment = (db: WorkerEnv["DB"]): WorkerEnv => ({
  DB: db,
  ASSETS: { fetch: () => Promise.resolve(new Response("asset shell")) },
  PHOTOS: { get: () => Promise.resolve(null), put: () => Promise.resolve(undefined), delete: () => Promise.resolve(undefined) },
})
const request = (db: WorkerEnv["DB"], method = "GET") => handleRequest(new Request("https://example.test/api/pihps/health", { method })).pipe(Effect.provide(workerLayer(environment(db))))
const json = (response: Response) => Effect.promise(() => response.json() as Promise<Record<string, unknown>>)
const fixture = Effect.gen(function* () {
  const db = yield* sqliteFixture
  for (const date of tradingDaysFromThrough("2026-09-17", "2026-10-16")) yield* db.coverage(date, "live")
  yield* db.price("2026-10-16", "31", 15000)
  const job = (at: string, status: string) => Effect.sync(() => db.sqlite.prepare("INSERT INTO job_runs (started_at, source_id, status) VALUES (?, 'pihps', ?)").run(at, status))
  yield* job("2026-10-16T10:15:00Z", "complete")
  return { ...db, job }
})

it.effect("waits for today's pending survey before 17:45 WIB and degrades at the deadline", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-19", "pending")
  yield* TestClock.setTime("2026-10-19T10:44:59Z")
  const waiting = yield* request(db.db)
  assert.strictEqual(waiting.status, 200)
  assert.strictEqual(waiting.headers.get("cache-control"), "no-store")
  assert.deepStrictEqual(yield* json(waiting), {
    status: "waiting", checkedAt: "2026-10-19T10:44:59.000Z", latestCheckedDate: "2026-10-16", latestPricedDate: "2026-10-16",
    oldestUnresolvedDate: "2026-10-19", lastAttemptAt: "2026-10-16T10:15:00Z", lastAttemptOutcome: "complete", lastSuccessfulRunAt: "2026-10-16T10:15:00Z",
  })
  yield* TestClock.setTime("2026-10-19T10:45:00Z")
  const late = yield* request(db.db)
  assert.strictEqual(late.status, 503)
  assert.strictEqual((yield* json(late)).status, "degraded")
}))

it.effect("does not let today's prices or newest completion conceal an older unresolved weekday", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-16", "error")
  yield* db.coverage("2026-10-19", "live")
  yield* db.price("2026-10-19", "31", 16000)
  for (const at of ["2026-10-19T07:00:00Z", "2026-10-19T11:00:00Z"]) {
    yield* TestClock.setTime(at)
    const response = yield* request(db.db)
    assert.strictEqual(response.status, 503)
    const body = yield* json(response)
    assert.strictEqual(body.status, "degraded")
    assert.strictEqual(body.oldestUnresolvedDate, "2026-10-16")
    assert.strictEqual(body.latestCheckedDate, "2026-10-19")
    assert.strictEqual(body.latestPricedDate, "2026-10-19")
  }
}))

it.effect("accepts a completed empty holiday and weekends without inventing newer prices", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-16", "empty")
  yield* Effect.sync(() => db.sqlite.exec("DELETE FROM prices_daily"))
  yield* db.price("2026-10-15", "31", 15000)
  for (const at of ["2026-10-17T11:00:00Z", "2026-10-18T11:00:00Z"]) {
    yield* TestClock.setTime(at)
    const response = yield* request(db.db)
    assert.strictEqual(response.status, 200)
    const body = yield* json(response)
    assert.strictEqual(body.status, "ok")
    assert.strictEqual(body.latestCheckedDate, "2026-10-16")
    assert.strictEqual(body.latestPricedDate, "2026-10-15")
    assert.strictEqual(body.oldestUnresolvedDate, null)
  }
}))

it.effect("reports live completion as healthy and isolates official retail observations", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-19", "live")
  yield* db.price("2026-10-19", "31", 90000, "beras", "panelharga")
  yield* db.price("2026-10-19", "31", 90000, "beras", "pihps", "grosir")
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  const response = yield* request(db.db)
  assert.strictEqual(response.status, 200)
  assert.strictEqual((yield* json(response)).status, "ok")
  assert.strictEqual((yield* json(yield* request(db.db))).latestPricedDate, "2026-10-16")
}))

it.effect("orders whole-second and millisecond job timestamps by instant", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-19", "live")
  yield* db.job("2026-10-19T10:15:00Z", "complete")
  yield* db.job("2026-10-19T10:15:00.001Z", "error")
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  const response = yield* request(db.db)
  assert.strictEqual(response.status, 503)
  assert.strictEqual((yield* json(response)).lastAttemptAt, "2026-10-19T10:15:00.001Z")
}))

for (const status of ["failed", "error"]) it.effect(`normalizes ${status} attempts and requires a later successful invocation`, () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-19", "live")
  yield* db.job("2026-10-19T10:15:00Z", status)
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  const failed = yield* request(db.db)
  assert.strictEqual(failed.status, 503)
  const body = yield* json(failed)
  assert.strictEqual(body.lastAttemptOutcome, "error")
  assert.strictEqual(body.lastSuccessfulRunAt, "2026-10-16T10:15:00Z")
  yield* db.job("2026-10-19T10:20:00Z", "complete")
  assert.strictEqual((yield* json(yield* request(db.db))).status, "ok")
}))

it.effect("keeps missing job evidence degraded even when all coverage is complete", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-19", "live")
  yield* Effect.sync(() => db.sqlite.exec("DELETE FROM job_runs"))
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  const response = yield* request(db.db)
  assert.strictEqual(response.status, 503)
  const body = yield* json(response)
  assert.strictEqual(body.status, "degraded")
  assert.strictEqual(body.lastSuccessfulRunAt, null)
  assert.strictEqual(body.lastAttemptAt, null)
  assert.strictEqual(body.lastAttemptOutcome, null)
}))

it.effect("returns sanitized unavailable evidence on a failed D1 read", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* Effect.sync(() => db.sqlite.exec("DROP TABLE source_days"))
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  const response = yield* request(db.db)
  assert.strictEqual(response.status, 503)
  assert.strictEqual(response.headers.get("cache-control"), "no-store")
  assert.deepStrictEqual(yield* json(response), {
    status: "unavailable", checkedAt: "2026-10-19T11:00:00.000Z", latestCheckedDate: null, latestPricedDate: null,
    oldestUnresolvedDate: null, lastAttemptAt: null, lastAttemptOutcome: null, lastSuccessfulRunAt: null,
  })
}))

it.effect("rejects malformed stored health evidence and disallows mutation methods", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.job("not-a-timestamp", "complete")
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  assert.strictEqual((yield* request(db.db)).status, 503)
  assert.strictEqual((yield* json(yield* request(db.db))).status, "unavailable")
  assert.strictEqual((yield* request(db.db, "POST")).status, 405)
}))

it.effect("rejects malformed latest official prices instead of calling them observed evidence", () => Effect.gen(function* () {
  const db = yield* fixture
  yield* db.coverage("2026-10-19", "live")
  yield* db.price("2026-10-19", "31", Number.POSITIVE_INFINITY)
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  const response = yield* request(db.db)
  assert.strictEqual(response.status, 503)
  assert.strictEqual((yield* json(response)).status, "unavailable")
}))

for (const schema of ["worker-migration", "schema-file"]) it.effect(`seeks bounded job evidence without scanning or sorting using ${schema}`, () => Effect.gen(function* () {
  const db = yield* fixture
  const queries: string[] = []
  const recordingDb = { ...db.db, prepare: (sql: string) => {
    if (sql.startsWith("SELECT started_at, status FROM job_runs")) queries.push(sql)
    return db.db.prepare(sql)
  } }
  yield* TestClock.setTime("2026-10-19T11:00:00Z")
  yield* request(recordingDb)
  assert.strictEqual(queries.length, 2)
  if (schema === "schema-file") {
    // Rebuild only the job indexes from the standalone schema, independently of Worker migration.
    const indexes = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'job_runs'").all()
    for (const index of indexes) yield* Effect.sync(() => db.sqlite.exec(`DROP INDEX "${String(index.name).replaceAll('"', '""')}"`))
    const sql = yield* Effect.promise(() => readFile(new URL("../../db/schema.sql", import.meta.url), "utf8"))
    yield* Effect.sync(() => db.sqlite.exec(sql))
  }
  for (const sql of queries) {
    const details = db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((row) => String(row.detail))
    assert.ok(details.some((detail) => detail.startsWith("SEARCH job_runs USING INDEX")), details.join("\n"))
    if (sql.includes("AND status = 'complete'")) assert.ok(details.some((detail) => detail.includes("source_id=? AND status=?")), details.join("\n"))
    assert.ok(!details.some((detail) => /SCAN job_runs|TEMP B-TREE/.test(detail)), details.join("\n"))
  }
}))
