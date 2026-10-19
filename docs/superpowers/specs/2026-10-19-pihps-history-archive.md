# PIHPS repository history archive

Approved scope: issue #37, following merged #36; daily synchronization belongs to #38.

Store the audited 2017-03-27 through 2026-09-15 range in tracked
`data/history/pihps/2017.json` through `2026.json`. Yearly columnar JSON keeps
dates and commodity/province arrays, including nulls. Exclude derived national
columns. Measurements: 5,614,856 bytes of columnar JSON versus 31,418,501 bytes
of observation-per-line arrays; gzip totals 733,098 bytes but obscures review.

The version-1 manifest identifies PIHPS eceran, derived repository provenance,
the immutable source commit/path/hash for each year, output hashes and byte
sizes, date ranges, observation/null counts, and unknown weekdays. The initial
archive contains 791,426 observations, 139,194 null cells, 2,449 observed dates
and 23 omitted weekdays. Original HTTP responses and completion evidence are
unavailable. Neither null cells nor omitted weekdays establish empty surveys.

Schema parsing rejects invalid dates, unsorted/duplicate keys, missing or extra
commodity/province columns, mismatched lengths, nonpositive/nonfinite prices,
unexpected fields and out-of-range data. Validation checks canonical bytes,
hashes and independently recomputed manifest statistics against the audit.

An explicit bootstrap reads hash-pinned recovered files using #36 validation.
Ordinary validate/rebuild/restore commands need only current tracked files.
Rebuilding canonical files is deterministic and has no current timestamps.
Build into a sibling staging directory, validate it, and publish with rollback;
invalid input and failed publication retain the previous archive. Keep a
publication lock to reject overlapping writers.

Restoration validates the complete archive before generating bounded SQL with
the existing import planner. Existing official values win; non-PIHPS key
collisions fail. No source_days, job_runs or citizen writes are generated.
Keep SQL, databases and raw files ignored. D1 remains the serving store; the
archive is outside public assets and frontend imports.

Verification covers malformed data and tampering, failed publication,
deterministic rebuild, real SQLite import/replay with conflicting existing
official data and newer metadata, both committed 38-province beras fixtures,
Rp 50 national rounding, and a clean-checkout local Wrangler/D1 restoration.
Required gates: typecheck, explicit affected tests and production build.
No production import, deployment or scheduler changes are authorized here.
