/** D1 statements for `laporan_warga`. Same text is appended in `db/schema.sql`. */
export const LAPORAN_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS laporan_warga (
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
)`,
  `CREATE INDEX IF NOT EXISTS laporan_warga_status_seen ON laporan_warga (status, seen_on)`,
  `CREATE INDEX IF NOT EXISTS laporan_warga_status_seen_id ON laporan_warga (status, seen_on, id)`,
  `CREATE INDEX IF NOT EXISTS laporan_warga_status_submitted ON laporan_warga (status, submitted_at)`,
] as const

export const LAPORAN_MIGRATION_SQL = LAPORAN_STATEMENTS.join(";\n")
