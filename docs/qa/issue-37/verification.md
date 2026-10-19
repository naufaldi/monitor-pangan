# Issue #37: PIHPS repository history verification

Verified locally on 19 October 2026. No production imports, deployments or
scheduler changes were performed. The archive reaches the default branch only
after the implementation PR is reviewed and merged.

## Archive and provenance

The ten yearly files contain 791,426 observed provincial prices and 139,194 null
cells across 2,449 dates, 2017-03-27 through 2026-09-15 inclusive. The manifest
lists the 23 omitted weekdays as unknown, not confirmed empty surveys. All source
completion evidence remains unknown for these derived observations.

Bootstrap used the recovered original files in the prior #36 worktree. It
verified every original SHA-256 against the reviewed repair manifest, used #36's
schema validation and provincial traversal, trimmed dates, and omitted national
columns. An independent code reviewer compared all 930,620 resulting cells with
the hash-pinned source Git files and found an exact match, including nulls.
There were no review findings.

The yearly files total 5,614,856 bytes, plus a 5,411-byte manifest. The format
comparison measured 31,418,501 bytes for observation-per-line arrays and 733,098
bytes for gzip level 9. Plain columnar JSON was selected for normal Git review.
The source repository occupied approximately 11 MiB of .git storage before the
archive implementation. No original HTTP responses were recovered or invented.

## Commands and required gates

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm typecheck
rtk pnpm exec vitest run scripts/pihps-history.test.mjs scripts/pihps-history-restore.test.mjs scripts/price-import.test.mjs scripts/pihps-scrape.test.mjs src/worker/price-store.test.ts src/data/price-summary.test.ts
rtk pnpm build
rtk pnpm history:pihps:validate
rtk pnpm history:pihps:rebuild
rtk pnpm history:pihps:rebuild
rtk git diff --check
```

Typecheck and production build passed; 49 tests passed across six explicit test
files. The focused independent review also ran the archive and price-import
files: 24 tests passed. Existing build warnings concern the route CLI's circular
import and large output chunks. No generated source files changed.

All 12 archive files (ten years, manifest and README) retained identical SHA-256
hashes across two actual rebuilds. Filesystem tests cover rejected validation,
publication-lock contention and rollback when installation fails after moving
the previous directory. Parser tests cover invalid/duplicate dates, missing/extra
columns, mismatched lengths, malformed prices and manifest tampering.

The full-size CLI/SQLite test imports all history, compares both 38-province
fixtures, retains a newer official row and source-day/job metadata, and repeats
the generated SQL with an exact zero delta in SQLite total_changes(). Canonical
row hashes remain identical. A separate test confirms an existing official
conflicting price wins and another-source collision aborts planning.

Inspected all 34 client build files: no archive directory or immutable archive
provenance marker appeared. D1 remains the application serving store.

## Isolated checkout export and real local Wrangler/D1

Exported all tracked and proposed source files into a fresh temporary directory.
No .git directory, old Git objects, ignored source archive, database, .dev.vars
or credentials were copied. The already-installed locked node_modules were
shared via a symlink; this was a clean source/data restore test, not a second
independent package installation. No source fetch was issued from the export.

Ran the following from that directory with isolated D1 persistence:

```sh
rtk pnpm history:pihps:validate
rtk proxy mkdir -p data/repairs
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --persist-to data/repairs/d1-clean --file db/schema.sql --json > data/repairs/schema.json
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --persist-to data/repairs/d1-clean --command 'SELECT * FROM prices_daily ORDER BY date, commodity_id, region_code, level' --json > data/repairs/prices-before.local.json
rtk pnpm history:pihps:restore --from 2017-03-27 --to 2026-09-15 --target local --dry-run --existing-json data/repairs/prices-before.local.json --out data/repairs/history.local.sql
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --persist-to data/repairs/d1-clean --file data/repairs/history.local.sql --json > data/repairs/import-first.json
rtk proxy node docs/qa/pr12/verify-history.mjs <isolated-d1.sqlite> data/repairs/prices-before.local.json > data/repairs/verified-first.json
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --persist-to data/repairs/d1-clean --file data/repairs/history.local.sql --json > data/repairs/import-repeat.json
```

The dry run planned 791,426 inserts, zero updates, zero coverage changes, 2,449
unverified observed dates and no newest verified live date. The original empty
baseline remained unchanged until the explicit local apply. SQL totaled
102,137,946 bytes; every statement stayed below 90 KB (maximum 89,999 bytes).
Wrangler reported every one of the first import's 1,138 execution results as
successful. Its local JSON supplied durations rather than row-change counters;
zero-write replay is independently asserted by the full-size SQLite test.

The first D1 verification found 791,426 cells on 2,449 dates, zero day markers
and zero job records. Both beras fixtures matched all 38 cells, including four
nulls each: 34 priced provinces, averages Rp 11,700 and Rp 15,750. The ordered
full-row SHA-256 was
`49320d930a5fb194012f93a4d964751c61085a32a75b9de9586f56f5b4538ad5`.

The replay returned another 1,138 successful execution results and retained the
identical row counts, fixture values and full-row checksum. A refreshed dry run
reported zero inserts, zero updates, 791,426 unchanged observations and zero
coverage changes. The final results are recorded in
[verification.json](verification.json). SQL, raw Wrangler results and databases
remain in ignored/local staging; the committed evidence contains only counts,
hashes and verification outcomes.
