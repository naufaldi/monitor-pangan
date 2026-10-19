import { DateTime, Option, Schema } from "effect"
import { CivilDateSchema, CommodityIdSchema, RegionCodeSchema } from "../data/price-schema.ts"
import type { D1Database } from "./d1-store.ts"

export const ArchiveEpochSchema = Schema.String.pipe(Schema.pattern(/^[a-f0-9]{32}$/))
export const ArchiveSequenceSchema = Schema.Number.pipe(Schema.int(), Schema.positive(), Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
export const ArchiveTimestampSchema = Schema.String.pipe(Schema.filter((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false
  const parsed = DateTime.make(value)
  return Option.isSome(parsed) && DateTime.formatIso(parsed.value) === (value.includes(".") ? value : value.replace("Z", ".000Z"))
}))
export const ArchiveSourceRefSchema = Schema.NullOr(Schema.String.pipe(Schema.pattern(
  /^(?:pihps-grid:\d{4}-\d{2}-\d{2}:\d{2}|git:[a-f0-9]{40}:public\/series\/\d{4}\.json|d1:pihps:[a-f0-9]{32}:\d+)$/,
)))
const Observation = Schema.Tuple(CommodityIdSchema, RegionCodeSchema,
  Schema.Number.pipe(Schema.int(), Schema.finite(), Schema.positive()), ArchiveSourceRefSchema)
export const ArchiveEventSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1), epoch: ArchiveEpochSchema, sequence: ArchiveSequenceSchema,
  kind: Schema.Literal("daily_ingest", "d1_reconciliation"), date: CivilDateSchema,
  capturedAt: ArchiveTimestampSchema,
  sourceCheck: Schema.NullOr(Schema.Struct({ status: Schema.Literal("live"), checkedAt: ArchiveTimestampSchema })),
  observations: Schema.Array(Observation).pipe(Schema.minItems(1), Schema.maxItems(380)),
}).pipe(Schema.filter((event) =>
  (event.kind === "daily_ingest" ? event.sourceCheck !== null : event.sourceCheck === null) &&
  event.observations.every((row, i) =>
    (i === 0 || `${event.observations[i - 1]![0]}:${event.observations[i - 1]![1]}` < `${row[0]}:${row[1]}`) &&
    (!row[3]?.startsWith("pihps-grid:") || row[3] === `pihps-grid:${event.date}:${row[1]}`) &&
    (!row[3]?.startsWith("git:") || row[3].endsWith(`/series/${event.date.slice(0, 4)}.json`))),
))
export type ArchiveEvent = typeof ArchiveEventSchema.Type

export const ARCHIVE_OUTBOX_SQL = `
CREATE TABLE IF NOT EXISTS pihps_archive_epoch (
  id INTEGER PRIMARY KEY CHECK (id = 1), epoch TEXT NOT NULL
);
INSERT OR IGNORE INTO pihps_archive_epoch (id, epoch) VALUES (1, lower(hex(randomblob(16))));
CREATE TABLE IF NOT EXISTS pihps_archive_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('daily_ingest', 'd1_reconciliation')),
  captured_at TEXT NOT NULL,
  source_check_json TEXT NOT NULL,
  observations_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pihps_archive_events_date_seq ON pihps_archive_events (date, seq DESC);
`

/** Read and compare the current day inside the same D1 transaction as publication. */
export const CAPTURE_ARCHIVE_DAY_SQL = `
WITH input AS (SELECT json_extract(?1, '$.date') AS date, json_extract(?1, '$.checkedAt') AS checked_at,
  json_extract(?1, '$.kind') AS kind),
snapshot AS (
  SELECT json_group_array(json_array(commodity_id, region_code, price,
    CASE WHEN raw_ref GLOB 'pihps-grid:*' OR raw_ref GLOB 'git:*:public/series/*.json' OR raw_ref GLOB 'd1:pihps:*'
      THEN raw_ref ELSE NULL END)) AS observations
  FROM (SELECT commodity_id, region_code, price, raw_ref FROM prices_daily
    WHERE source_id = 'pihps' AND level = 'eceran' AND date = (SELECT date FROM input) AND price IS NOT NULL
    ORDER BY commodity_id, region_code)
)
INSERT INTO pihps_archive_events (date, kind, captured_at, source_check_json, observations_json)
SELECT input.date, input.kind, input.checked_at,
  CASE WHEN input.kind = 'daily_ingest' THEN json_object('status', 'live', 'checkedAt', input.checked_at) ELSE 'null' END,
  snapshot.observations FROM input, snapshot
WHERE snapshot.observations <> '[]' AND snapshot.observations IS NOT
  (SELECT observations_json FROM pihps_archive_events WHERE date = input.date ORDER BY seq DESC LIMIT 1)
`
export const capturePublishedDay = (db: D1Database, date: string, checkedAt: string) =>
  db.prepare(CAPTURE_ARCHIVE_DAY_SQL).bind(JSON.stringify({ date, checkedAt, kind: "daily_ingest" }))
