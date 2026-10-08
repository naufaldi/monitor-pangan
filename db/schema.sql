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
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS laporan_warga_status_seen ON laporan_warga (status, seen_on);

CREATE INDEX IF NOT EXISTS laporan_warga_status_seen_id ON laporan_warga (status, seen_on, id);

CREATE INDEX IF NOT EXISTS laporan_warga_status_submitted ON laporan_warga (status, submitted_at);
