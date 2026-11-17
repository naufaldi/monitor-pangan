CREATE TABLE IF NOT EXISTS commodities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'liter'))
);

CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'province'
);

CREATE TABLE IF NOT EXISTS prices_daily (
  date TEXT NOT NULL,
  commodity_id TEXT NOT NULL REFERENCES commodities (id),
  region_code TEXT NOT NULL REFERENCES regions (code),
  level TEXT NOT NULL DEFAULT 'eceran',
  price INTEGER,
  source_id TEXT NOT NULL,
  raw_ref TEXT,
  PRIMARY KEY (date, commodity_id, region_code, level)
);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE INDEX IF NOT EXISTS prices_daily_trend ON prices_daily (commodity_id, source_id, level, date);

CREATE INDEX IF NOT EXISTS job_runs_health_attempt ON job_runs (source_id, COALESCE(julianday(started_at), 1e99) DESC, id DESC);

CREATE INDEX IF NOT EXISTS job_runs_health_success ON job_runs (source_id, status, COALESCE(julianday(started_at), 1e99) DESC, id DESC);

CREATE TABLE IF NOT EXISTS source_days (
  date TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (date, source_id)
);

CREATE TABLE IF NOT EXISTS laporan_warga (
  id TEXT PRIMARY KEY,
  commodity_id TEXT NOT NULL,
  outlet TEXT NOT NULL CHECK (outlet IN ('pasar', 'ritel')),
  price INTEGER NOT NULL CHECK (price BETWEEN 100 AND 1000000),
  place_code TEXT NOT NULL,
  seen_on TEXT NOT NULL,
  alias TEXT,
  photo_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'reviewed', 'rejected')),
  evidence TEXT CHECK (evidence IS NULL OR evidence IN ('receipt', 'board', 'none')),
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT,
  receipt_token_hash TEXT
);

CREATE INDEX IF NOT EXISTS laporan_warga_status_seen ON laporan_warga (status, seen_on);

CREATE INDEX IF NOT EXISTS laporan_warga_status_seen_id ON laporan_warga (status, seen_on, id);

CREATE INDEX IF NOT EXISTS laporan_warga_status_submitted ON laporan_warga (status, submitted_at);

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

CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS pihps_fresh_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_revision INTEGER,
  payload TEXT
);
INSERT OR IGNORE INTO pihps_fresh_state (id, epoch, revision) VALUES (1, lower(hex(randomblob(16))), 0);

CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_insert
AFTER INSERT ON prices_daily
WHEN NEW.source_id = 'pihps' AND NEW.level = 'eceran' AND NEW.price IS NOT NULL
BEGIN
  UPDATE pihps_fresh_state SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_delete
AFTER DELETE ON prices_daily
WHEN OLD.source_id = 'pihps' AND OLD.level = 'eceran' AND OLD.price IS NOT NULL
BEGIN
  UPDATE pihps_fresh_state SET revision = revision + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS pihps_fresh_revision_archive
AFTER INSERT ON pihps_archive_events
BEGIN
  UPDATE pihps_fresh_state SET revision = revision + 1 WHERE id = 1;
END;
