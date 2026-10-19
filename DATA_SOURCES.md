# DATA_SOURCES.md — Monitor Pangan provenance

Unofficial dashboard of published food-price observations. PIHPS prices and
sample data have separate provenance; sample data must never be labeled official.
Source sites:

- Panel Harga Pangan, Badan Pangan Nasional — https://panelharga.badanpangan.go.id/
- NFA Web API docs / registration — https://webapi.badanpangan.go.id/documentasi
- Open Data Pangan — https://data.badanpangan.go.id/
- PIHPS Bank Indonesia FAQ — https://www.bi.go.id/hargapangan/Informasi/FAQ

The current custom Worker serves official PIHPS observations from D1 and runs
daily ingestion. [The operations runbook](docs/operations/pihps.md) owns health,
schedule, audit, clean-checkout recovery and target-specific repair commands.
The 19 October 2026 production audit and local restoration below are separate
dated results; local success does not establish production backfill/deployment.

## What the scrapers do (2026-09-16)

`pnpm run ingest` runs two public, keyless scrapers — the same calls the public
sites make — rate-limited one-shot, cached to `data/raw/`:

**PIHPS BI (live daily prices, primary)** — `scripts/scrape-pihps.mjs [YYYY-MM-DD]`
- `GET /hargapangan/WebSite/TabelHarga/GetGridDataDaerah` with
  `price_type_id=1` (pasar tradisional = eceran), `tipe_laporan=1` (harian),
  per province. No key, no login.
- 2026-09-16: 310/380 provincial observations live (31 provinces x 10 groups).
  Source-empty that day: Kepri, Kalbar, Kaltara (`{"data":[]}` — intermittent,
  they usually serve data) plus the 4 post-2022 Papua provinces (93–96:
  Papua Selatan/Tengah/Pegunungan/Barat Daya) PIHPS never surveys — no BI
  `province_id` exists for them. Live snapshots leave those cells empty
  (no mock fill); `nationalAvg` averages only real PIHPS prices.
- History depth (verified 2026-09-17): earliest served date is 2017-03-27.
  2014 through mid-March 2017 return `{"data":[]}`. Format is stable across
  years: same ten `level == 1` categories, same `d/m/yyyy` column header.
- Historical coverage was previously described as a complete raw backfill, with
  omitted dates classified as holidays. The October audit could not recover
  those raw HTTP responses, so that completion claim is withdrawn. The pinned
  derived archive proves observations, not successful checks of every scope.
  Its 23 omitted weekdays remain unknown. See the audited recovery workflow below.
- The CLI accepts a date, inclusive date pair, or year. It skips saved dates
  unless `--force` is supplied. Forced retries retain previously observed cells
  when a scope fails or loses cells. Exhausted HTTP/JSON retries are errors,
  never confirmed emptiness; failures leave resumable results and exit nonzero.
  A full-date HTTP outage waits 60 seconds before the next date in this CLI only.
  `pnpm run manifests` rebuilds per-date status from validated raw files.
  `pnpm run normalize` writes `data/snapshots/coverage.json`, including partial
  failures and the newest fully verified live date. Legacy files without scope
  statuses remain unverified. Corrupt raw files stop processing before replacement.
- Panel catalog API (`api-panelhargav2.badanpangan.go.id`) times out from some
  networks. When it does, `scripts/scrape-panelharga.mjs` synthesizes
  `provinces` (in-repo 38-province list) and `cms_eceran` (join-relevant ids)
  into `data/raw/panelharga-*.json` with a `catalogSynthesized` provenance
  flag instead of failing the pipeline. The join only needs `national_id`
  values plus eceran commodity ids, so prices are unaffected.

**Panel Harga catalog (metadata)** — `scripts/scrape-panelharga.mjs`

- `provinces?search=` — 38 provinces (IDs match Kemendagri `REGION_CODE`)
- `cms/eceran` — 27 eceran (konsumen, `level_harga_id=3`) commodities with units
- `cms/produsen` — 18 produsen commodities
- `cms/config/keterangan?level_harga_id=3` — HET/HAP footnotes

Daily per-province price endpoints (`front/harga-pangan-table`,
`front/harga-peta-provinsi`, `front/table-rekapitulasi`) return
`401 Unauthorized` — the embedded `x-api-key` in the public bundle is rotated
server-side. The scraper records the 401 and continues; no credential bypass.

## Optional Panel Harga integration (manual parallel track)

PIHPS is already live. These steps concern the separate Panel Harga source,
which remains gated by registration/access; they are not prerequisites for
serving official PIHPS data or evidence that the daily Worker is merely proposed.

1. Register at https://webapi.badanpangan.go.id/register (needs
   Nama/Email/No.Telp/Lembaga/Dokumen), wait for Pusdatin approval, copy the
   `X-Authorization` key. Daily cron filters `level=eceran` for consumer prices.
2. Or download the monthly "Rata-rata Harga Pangan Bulanan Tingkat Konsumen
   Provinsi" CSV from Open Data (survey form + SAPA gated) into
   `data/raw/manual-*.csv`, then `pnpm run normalize`.
3. Validate and label any imported Panel Harga observations with their own
   provenance. Never relabel samples or PIHPS observations as Panel Harga data.

## Semantics (PIHPS FAQ)

Eceran traditional-market survey, Mon–Fri 09:00–11:00 WIB, published ~13:00.
Province price = mean of surveyed kab/kota; national = mean of all.
Units Rp/kg except cooking oil Rp/liter. Weekend/holiday UIs show the last
trading day labeled as such.

## Laporan harga warga

Citizen reports live in `laporan_warga` and the R2 bucket
`monitor-pangan-laporan`. They never enter `prices_daily`, the PIHPS map,
Grafik, or Daya Beli.

Secrets stay out of the repo. Set them with Wrangler, each value at least 32
random bytes where noted. These commands update remote Worker secrets and
require a separately authorized production configuration change; none ran here:

```sh
rtk pnpm exec wrangler secret put ADMIN_SECRET
rtk pnpm exec wrangler secret put TURNSTILE_SECRET
rtk pnpm exec wrangler secret put TURNSTILE_SITE_KEY
rtk pnpm exec wrangler secret put R2_ACCOUNT_ID
rtk pnpm exec wrangler secret put R2_ACCESS_KEY_ID
rtk pnpm exec wrangler secret put R2_SECRET_ACCESS_KEY
```

`ADMIN_SECRET` must be at least 32 bytes. `R2_BUCKET_NAME` is the non-secret
var `monitor-pangan-laporan` in `wrangler.toml`. Local values belong in
`.dev.vars`, which is gitignored.

Photos land at `pending/<id>.jpg` and move to `decided/<id>.jpg` when a report
is approved or rejected. One lifecycle rule, in `r2-lifecycle.json`, deletes
objects under `decided/` 30 days after upload (2,592,000 seconds). Pending
objects are not auto-deleted. There is no retention cron. Apply the rule
yourself when the remote bucket exists; this remote R2 mutation requires
separate authorization and was not run by this change:

```sh
rtk pnpm exec wrangler r2 bucket lifecycle set monitor-pangan-laporan --file r2-lifecycle.json
```

The browser PUTs the JPEG to R2, so the bucket also needs a CORS rule that
allows `PUT` with `content-type` from `https://monitor.naufaldi.com`.
`r2-cors.json` is that rule. Apply it yourself; this change does not run it:

```sh
rtk pnpm exec wrangler r2 bucket cors set monitor-pangan-laporan --file r2-cors.json
```

A Free WAF rate limit on `POST /api/laporan` (per IP, 10 seconds, Block) is
dashboard-only and is not applied here.

## Audited historical recovery (19 October 2026)

The production audit found 8,040 official provincial observations on 24 dates,
2026-09-16 through 2026-10-19, and no earlier rows. The existing repository-derived
archive is pinned to commit `ef85f27904b044bd343a56dcdd77a46d28eb1205`, paths
`public/series/2017.json` through `2026.json`. Recovery checks the committed
[repair manifest](docs/qa/pr12/repair-manifest.json) SHA-256 for each file and
validates dates, commodity/province columns, lengths and positive integer prices
with Effect Schema. It does not merge code from that commit. Use Node 24 for
these CLI commands (`node:sqlite` reads explicitly selected local databases).

The repair interval is **2017-03-27 through 2026-09-15 inclusive**: 2,449 observed
dates and 791,426 provincial cells. September 16 onward is excluded because ten
region-64 observations disagree with the current bundle. Archived national
columns are ignored. Current national values still use the mean of observed
provinces rounded to Rp 50. Every recovered observation retains its original
`git:<commit>:public/series/<year>.json` provenance in `raw_ref`.

For a clean checkout, fetch and verify the pinned Git object before recovery.
The runbook includes complete local/remote baseline-export commands. Recover
into ignored local storage, then use a complete durable local baseline for SQL
and a JSON dry-run report:

```sh
rtk git fetch origin ef85f27904b044bd343a56dcdd77a46d28eb1205
rtk git rev-parse FETCH_HEAD
rtk pnpm exec node scripts/recover-pihps-history.mjs --out data/archive/pihps-derived
rtk proxy mkdir -p data/repairs
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --command 'SELECT * FROM prices_daily ORDER BY date, commodity_id, region_code, level' --json > data/repairs/prices-before.local.json
rtk pnpm exec node scripts/seed-d1.mjs --input-dir data/archive/pihps-derived --from 2017-03-27 --to 2026-09-15 --target local --dry-run --existing-json data/repairs/prices-before.local.json --out data/repairs/historical.sql
```

The baseline must be one complete `SELECT * FROM prices_daily` Wrangler
`--json` result, not an empty stand-in. The actual audit baseline hash is
`dfe4dc08f27bf4cff81d98d444acf4a8ac9a042fba03b4942443e98a6c26cdee`.
For another environment, export its complete table with an explicit
`rtk pnpm exec wrangler d1 execute monitor-pangan --local` or `--remote` target and
`--command 'SELECT * FROM prices_daily ORDER BY date, commodity_id, region_code, level' --json`.
Use the exported JSON as `--existing-json`. A static export describes only the
snapshot time; regenerate immediately before any separately authorized apply.
`--target remote` labels a dry run for a remote baseline and never applies SQL.

Inspect `data/repairs/historical.sql.report.json` before applying locally. The
initial 19 October 2026 dry run had 791,426 planned inserts, zero updates, 8,040
existing rows preserved, zero coverage changes and 23 unknown omitted weekdays.
A new baseline after import instead reports those historical rows unchanged.
Derived observations have no
original request statuses, so **none of the 2,449 dates creates `source_days`
completion markers**. Current ingestion owns existing source-day/job metadata.
There is no weekly full-history cron.

Local validation commands (already exercised; no production writes):

```sh
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file db/schema.sql --json
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file data/repairs/historical.sql --json
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file data/repairs/historical.sql --json
```

The combined local database has **799,466 cells on 2,473 dates**, with the original
8,040 newer rows, 23 source-day markers and 55 jobs unchanged. Both historical
beras fixtures match all 38 province cells, including four nulls each:
2018-10-09 has 34 prices and national Rp 11,700; 2025-10-30 has 34 prices and
national Rp 15,750. Applying the same SQL again preserves counts and canonical
row checksum `b631938aca4c5cfe514b73f29b512bef9a7270504c343e51e9f9e855f12c3274`.
See [local import evidence](docs/qa/pr12/history-import.json) for hashes and results.
Wrangler emitted a workerd hash-table-collision warning during bulk imports;
all statements succeeded and row/fixture checks found no mismatch. The final
SQL replay changed zero rows and emitted no warning.

Discover the intended local SQLite file, then reproduce the complete checksum
and both 38-cell fixture comparisons with the read-only QA helper:

```sh
rtk rg --files --hidden --no-ignore .wrangler/state/v3/d1 -g '*.sqlite'
rtk pnpm exec node docs/qa/pr12/verify-history.mjs /absolute/path/to/local-d1.sqlite data/repairs/prices-before.local.json
```

The checksum helper needs the retained pre-import baseline. The dated evidence
used a session-specific `.superpowers` export; future operations use the durable
ignored `data/repairs` path above. A post-import export cannot prove first-import
preservation.

A dry run against an explicit SQLite file reads prices and source-day metadata
without writing the file. Locate the intended `.sqlite` file under the local
Wrangler state directory and supply its full path:

```sh
rtk pnpm exec node scripts/seed-d1.mjs --input-dir data/archive/pihps-derived --from 2017-03-27 --to 2026-09-15 --target local --dry-run --existing-db /absolute/path/to/local-d1.sqlite --out data/repairs/historical-repeat.sql
```

After the local import this reports zero inserts/updates and 791,426 unchanged
observations. SQL uses multirow statements below 90 KB, preserving a margin under
D1's 100 KB statement limit. Existing PIHPS values win, including any disagreement
listed in `differingOfficial`; other-source primary-key conflicts abort planning.
The emitted SQL also rejects later other-source collisions atomically within
each statement, using an intentional invalid-JSON expression in that conflict
branch. A runtime `malformed JSON` error here means stop and regenerate the
conflict audit. Earlier completed chunks remain safely resumable. Reapplying
known official keys causes no price updates.

Other supported seed inputs use the same mandatory `--from`, `--to`, `--target`,
`--dry-run`, baseline and `--out` options: `--raw-dir data/raw`,
`--snapshot <file>`, a positional year for `data/snapshots/<year>.json`, or the
latest snapshot when no input selector is supplied. Only official PIHPS eceran
observations pass validation. Verified original raw scopes can generate
`live`/`pending`/`empty` source-day metadata; partial errors and preserved fallback
cells cannot. The raw `fetchedAt` must be canonical UTC ISO (whole seconds or
three-digit milliseconds). Its date in Asia/Jakarta determines emptiness:
zero-cell checks on their survey day remain `pending`, even when imported later;
only successful checks after that date establish `empty`. Positive observations
remain `live`, and empty retries preserve existing live markers and cells.
Out-of-order replay also preserves confirmed `empty` against weaker `pending`
evidence and retains the latest check instant. Whole-second and millisecond
timestamps are compared as instants, so equivalent formats cause no writes.
Dry-run coverage counts use the same transition as SQL; a newer marker written
after planning is protected by the SQL guard and requires a fresh dry run for
updated counts. Another source's day marker does not count as PIHPS coverage.
A price-JSON baseline requires a separate `--coverage-json` complete
`SELECT * FROM source_days` export for exact coverage-change counts. Snapshots
without original scopes import observations only. No repair touches
`laporan_warga`, deletes observations, updates newer dates, or appends job runs.

The trend query previously used the date-leading primary key, scanning every
commodity/source in the range. Local `EXPLAIN QUERY PLAN` now selects
`prices_daily_trend (commodity_id, source_id, level, date)` with equality on the
first three columns and a date range. Both `db/schema.sql` and the Worker cold
migration create this measured index.


## Validated local Worker verification

The [19 October runtime evidence](docs/qa/pr12/runtime-verification.md) exercises
built assets through real local Wrangler/D1 on port 8787, including both archive
fixtures, sparse pagination, explicit error/empty states, retry and request races,
and desktop/390px screenshots. A D1 compound-SELECT incompatibility found during
this check was fixed with sequential indexed health reads. The
[controlled scheduler record](docs/qa/pr12/cron-verification.md) verifies Friday,
Monday, delayed publication and failed-run outcomes without live source HTTP.

Follow the [PIHPS runbook](docs/operations/pihps.md) for repeatable setup and
read-only auditing. The separate [production rollout checklist](docs/qa/pr12/production-rollout.md)
requires fresh target baselines, actual account quota/tier verification, reviewed
scoped repair SQL, and authorized deployment plus real trigger/event readback.
Production history and corrected triggers remain unapplied; local seeds do not
establish remote readiness.
