# PIHPS historical observations

The repository owns this recovery archive; D1 remains the application's serving
store. These files are not public assets and must never be imported into the
frontend bundle. Daily archive synchronization is follow-up issue #38.

## Version 1 contract

`2017.json` through `2026.json` cover **2017-03-27..2026-09-15** inclusive:
2,449 dates, 791,426 observed provincial prices and 139,194 null cells.
Each file has `schemaVersion: 1`, numeric `year`, sorted unique weekday `dates`,
and `values[commodityId][provinceCode]`, an array aligned with `dates`.
All ten commodity groups and 38 province codes must be present. Prices are
positive finite integer rupiah; null means no recovered price, never zero.
Units follow `src/data/pihps-catalog.ts`: kg, except cooking oil in liters.

No national series is stored. Compute national values from observed provinces
with the application's Rp 50 rounding policy. The four post-2022 Papua province
columns remain null where PIHPS has no surveyed observation.

`manifest.json` contains the schema version, PIHPS/eceran source identity,
inclusive range, total and per-year date/observation/null counts, output SHA-256
hashes and byte sizes, original source commit/path/hash, and all 23 unknown
omitted weekdays. Runtime schemas and canonical serialization are defined in
`scripts/pihps-history.mjs`. Column/date uniqueness makes every
`(date, commodity_id, region_code, level)` observation key unique.

## Provenance and ownership

These are **derived repository observations**, recovered and audited in #36
from immutable commit `ef85f27904b044bd343a56dcdd77a46d28eb1205`, original paths
`public/series/<year>.json`. The original HTTP responses were not recovered.
The source hashes in the manifest describe those complete original files;
output hashes describe the trimmed provincial-only files here. The 2026 source
file extends past this archive's cutoff, so its input and output counts differ.

Preserving this archive does not independently reverify every price against BI.
The audit spot-checked Jakarta beras on the two regression dates. All recovered
values passed structural validation. Missing weekdays remain unknown; neither
an observed date nor a null cell proves that every HTTP scope completed.
Restore observations only, without creating `source_days` or `job_runs`.

September 16 onward is excluded: ten region-64 cells on 2026-09-16 disagreed
with the current official bundle. Any expanded range requires a new reviewed
reconciliation and schema/audit update. Existing official D1 prices always win.

Keep raw responses, SQL, local databases, credentials and citizen data outside
this directory. Git review owns changes to the archive and its provenance.

## Validation and rebuild

Use Node 24 and the root pnpm lockfile:

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm history:pihps:validate
rtk pnpm history:pihps:rebuild
rtk git diff --exit-code -- data/history/pihps
```

Validation checks schemas, dates, positive finite integer prices, unique keys,
column lengths, canonical bytes, hashes, per-year counts and agreement with the
reviewed audit. Rebuild reads current tracked files, validates a sibling staged
archive and publishes with an exclusive lock and rollback on installation
failure. It adds no current timestamps. Invalid input leaves previous files
untouched. A stale `pihps.lock` after a process crash must be inspected before
manual removal; verify no publisher is running and retain any `.previous`
directory before recovery. Ordinary validate/rebuild/restore never fetch old
Git objects or use `data/archive/`.

## Local D1 restoration

The generator writes SQL and a dry-run report; it never applies SQL.

```sh
rtk proxy mkdir -p data/repairs
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file db/schema.sql --json
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --command 'SELECT * FROM prices_daily ORDER BY date, commodity_id, region_code, level' --json > data/repairs/prices-before.local.json
rtk pnpm history:pihps:restore --from 2017-03-27 --to 2026-09-15 --target local --dry-run --existing-json data/repairs/prices-before.local.json --out data/repairs/history.local.sql
```

Inspect `data/repairs/history.local.sql.report.json`. For an empty database,
expect 791,426 inserts, zero updates and zero coverage changes. For a populated
database, review `differingOfficial`, preserved rows and planned inserts.
Another-source primary-key collision aborts planning. The complete baseline
export is mandatory and must describe the intended target immediately before
planning. `--existing-db /absolute/path/to/local-d1.sqlite` is an alternative.

Apply to **local D1 only**, then rerun the same SQL to confirm idempotence:

```sh
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file data/repairs/history.local.sql --json
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file data/repairs/history.local.sql --json
```

All 38 beras cells must match `src/data/fixtures/pihps-2018-10-09.json` and
`pihps-2025-10-30.json`: 34 observed provinces each, national Rp 11,700 and
Rp 15,750 respectively. Regenerating against a post-import baseline reports
zero inserts and 791,426 unchanged observations. Newer rows, official conflicts,
source-day/job metadata and citizen data remain intact.

The [PIHPS runbook](../../../docs/operations/pihps.md) covers target selection
and production rollout. This archive does not authorize production imports.

## Representation and bootstrap

The yearly JSON totals 5,614,856 bytes (5.61 MB decimal), versus 31,418,501 bytes
for observation-per-line arrays. Gzip level 9 totals 733,098 bytes, but plain
JSON allows normal code review. One commodity/province array per line limits
repeated keys. Git compresses repository objects independently.

The initial bootstrap verified #36's original SHA-256 hashes before trimming
dates and removing national columns. Reproduction from those original inputs
is optional forensic work, not a restoration prerequisite:

```sh
rtk proxy node scripts/history-pihps.mjs build data/archive/pihps-derived data/history/pihps
```

The existing `recover-pihps-history.mjs` can recover those original inputs from
the pinned Git object when separately available. Their absence never blocks
validation or restoration of the committed archive.
