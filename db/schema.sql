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
