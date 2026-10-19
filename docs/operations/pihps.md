# PIHPS operations

Current code and configuration: [`src/worker/index.ts`](../../src/worker/index.ts),
[`ingest.ts`](../../src/worker/ingest.ts), [`wrangler.toml`](../../wrangler.toml).
Use Node 24 and pnpm from the repository root. The custom Worker owns APIs,
scheduled ingestion and HTML asset delivery. Vite development alone does not
exercise its D1 routes.

## Storage ownership

| Store | Owner and evidence |
| --- | --- |
| D1 `prices_daily` | Official observations keyed by date, commodity, province and level. Public prices use `source_id='pihps'`, `level='eceran'`, finite positive values. An observed price does not establish completed HTTP scope coverage. |
| D1 `source_days` | Daily pipeline and verified original raw imports own checked survey states. Derived archives never create completion markers. |
| D1 `job_runs` | Worker invocations record `complete` or `error`; legacy `failed` is an error. A successful zero-row invocation is possible. |
| `data/raw/`, `data/snapshots/` | Ignored local CLI source responses and normalized outputs. Preserve request-level statuses and timestamps. |
| `data/history/pihps/` | Tracked, version-1 recovery archive: yearly provincial observations, nulls, manifest hashes/counts and immutable derived provenance. Repository review owns updates; D1 serves prices. |
| `data/archive/pihps-derived/` | Optional ignored original derived files for forensic bootstrap. Ordinary validation/restoration does not need these or the old Git object. |
| `data/repairs/` | Ignored durable baselines, proposed SQL and dry-run reports. Keep a separate baseline for each target. |
| Citizen D1/R2 data | `laporan_warga` and the `PHOTOS` R2 binding remain separate. No price repair changes citizen reports, photos or credentials. |

## Historical backfill versus daily ingestion

The historical repair is an explicit offline range, **2017-03-27..2026-09-15**.
It restores provincial observations and retains existing official values. It
does not create historical `source_days`, append jobs, delete prices or rewrite
September 16 onward. National figures are calculated from observed provinces,
rounded to Rp 50. Missing provinces stay null.

Daily scheduling begins strictly after `STATIC_LIVE_THROUGH` (`2026-09-16`).
The planner chooses the oldest unresolved weekday through today in Jakarta.
When caught up, it can refresh today's completed survey. Saturday and Sunday
add no new survey date. The two daily triggers are not a full-history repair.

## UTC and Asia/Jakarta schedule

| Checked-in cron | UTC | Asia/Jakarta (WIB, UTC+7) |
| --- | --- | --- |
| `15 7 * * MON-FRI` | Monday–Friday 07:15 | Monday–Friday 14:15 |
| `15 10 * * MON-FRI` | Monday–Friday 10:15 | Monday–Friday 17:15 |

The health observation deadline is **17:45 WIB / 10:45 UTC**. Today's unresolved
survey can be `waiting` before that deadline; it becomes `degraded` at the
deadline. An older unresolved weekday is degraded at either time. This buffer
allows publication and execution time; it does not declare that BI must publish
on a holiday.

The [19 October 2026 production audit](../qa/pr12/data-audit.md) found the older
deployed numeric schedules `1-5`, interpreted by Cloudflare as Sunday–Thursday,
including Friday work deferred until Sunday. `MON-FRI` is the branch correction.
Its presence in this file does not prove deployed triggers changed.

## Day states and request limits

| State | Meaning |
| --- | --- |
| `live` | All 34 provincial source requests succeeded and at least one positive provincial observation exists. |
| `pending` | All requests succeeded with zero observations on the survey date itself. Publication may still arrive. |
| `empty` | A successful zero-observation check after the survey date. It confirms observed absence, not the holiday reason or calendar. |
| `error` | Fetch, decode or storage failed. Retained prices do not turn this into a successful check. |
| Missing marker | No verified coverage evidence; never infer empty from absent prices or a derived archive. |

One scheduled invocation selects at most one date: 34 requests, concurrency five,
with no immediate HTTP retry or 60-second sleep in the Worker. The next scheduled
invocation resumes unresolved work. A failure remains rejected after recording a
job so Cloudflare can observe the failure. Terminal logs include `pihps_ingest`,
target date, outcome, category, confirmed rows and job-recording outcome.

## Health and freshness

`GET /api/pihps/health` returns `cache-control: no-store`. It returns HTTP 200 for
`ok` or expected `waiting`, and HTTP 503 for `degraded` or `unavailable`.
`checkedAt` is report time in canonical UTC ISO. `latestCheckedDate` comes only
from completed `live`/`empty` markers in the daily period. `latestPricedDate`
comes from actual official retail observations, including history. Neither is
substituted for the other. `oldestUnresolvedDate` checks every eligible weekday,
so a newer maximum cannot conceal an old gap. The last attempt and last success
come from independent bounded job reads. Legacy `failed` becomes public `error`.
No successful job evidence, or a latest error attempt, yields `degraded` even
when prices remain readable. A database/decode failure yields `unavailable` with
nullable observations and a sanitized log. Notes, SQL and exceptions are private.

The latest-price query uses one separate sequential backwards index seek per
canonical commodity. This avoids D1's measured five-term compound-SELECT limit
while retaining indexed reads rather than aggregating the historical price table. Coverage is limited
to the scheduled period. Job reads use `job_runs_health_attempt` and
`job_runs_health_success`, whose source/order and source/status/order expression
keys match the exact instant ordering. Each reads at most one attempt or
success without sorting historical jobs. Malformed timestamps retain the high
sort key that makes decoding reject them. Both schema entry points create these
indexes; cold migration plus a complete 340-cell day stays within the D1 query
budget. The endpoint is evidence of stored state, not proof that a particular
future Cron Trigger ran.

`GET /api/pihps/fresh?after=2026-09-16` serves observed overlay rows. Database or
decode failures return HTTP 503 JSON `{"error":"freshness_unavailable"}`.
HTML assets still load without an injected overlay and log
`pihps_freshness_unavailable` with `surface: html`. A browser refresh rejects
the failed request before changing its last usable overlay. A successful empty
freshness response describes no newer observations, not a verified empty survey.

## Clean-checkout setup

Install dependencies and verify the runtime:

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm exec node --version
rtk proxy mkdir -p data/repairs
```

The current checkout includes the audited archive. Validate its versioned schema,
positive finite integer prices, unique observation keys, hashes, per-year counts
and audited date range before planning a restore:

```sh
rtk pnpm history:pihps:validate
rtk pnpm history:pihps:rebuild
rtk git diff --exit-code -- data/history/pihps
```

Rebuild has stable ordering and no changing timestamps. It validates a sibling
stage before publication, rejects concurrent writers and restores the previous
directory on installation failure. Validation failure leaves archive bytes
untouched. The archive [README](../../data/history/pihps/README.md) documents
schema, storage-size measurements, locks/crash recovery and the optional original
hash-pinned bootstrap. A clean restore never fetches the old feature commit.

The archive preserves derived observations, not original HTTP evidence. Its
139,194 null cells and 23 omitted weekdays do not establish empty surveys. It
contains no national series, SQL, database, raw responses, credentials or citizen
data. D1 stays the serving store; do not import the archive into frontend code.
Daily synchronization is issue #38 and is outside this initial historical import.

**Local target only:** initialize an empty local database with the checked-in
schema. This does not seed historical prices or prove remote access:

```sh
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file db/schema.sql --json
```

For a local custom-Worker session after building assets:

```sh
rtk pnpm build
rtk pnpm exec wrangler dev --local --port 8787
```

The development server remains running until stopped. It uses local D1/R2;
never add `--remote` to reproduce fixture work.

## Read-only coverage and job queries

[`pihps-audit.sql`](pihps-audit.sql) includes the original audit's per-year cell
and date counts, last 40 day states and last 20 jobs, plus explicit missing
weekday and regression-date checks. The historical count query counts stored
non-null cells; successful public reads additionally enforce valid positive
observations. Inspect eligible date membership, not just the row count/max date.

**Local target, read-only:**

```sh
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file docs/operations/pihps-audit.sql --json
```

**Remote target, read-only, account access required:**

```sh
rtk pnpm exec wrangler d1 execute monitor-pangan --remote --file docs/operations/pihps-audit.sql --json
```

Record observation time and target with saved results. Missing account access
means remote state is unverified, not that production has no data.

## Explicit-range repair with dry run

The SQL generator never applies SQL. Take complete target-specific baselines
immediately before planning. `rtk proxy` keeps redirected Wrangler JSON raw.
These are durable ignored paths, independent of this session's work ledger.

**Local target, read-only exports:**

```sh
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --command 'SELECT * FROM prices_daily ORDER BY date, commodity_id, region_code, level' --json > data/repairs/prices-before.local.json
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --local --command 'SELECT * FROM source_days ORDER BY date, source_id' --json > data/repairs/coverage-before.local.json
rtk pnpm history:pihps:restore --from 2017-03-27 --to 2026-09-15 --target local --dry-run --existing-json data/repairs/prices-before.local.json --coverage-json data/repairs/coverage-before.local.json --out data/repairs/historical.local.sql
```

Inspect `data/repairs/historical.local.sql.report.json`: target, range, hashes,
inserts/updates, preserved rows, `differingOfficial`, unresolved errors and
coverage changes. Derived-file repair must have zero coverage changes. The
first exercised import on 19 October had 791,426 inserts, zero updates and
8,040 preserved newer cells. A repeat against the now-restored local database
must instead report zero inserts/updates and 791,426 unchanged historical cells.
Those counts are dated evidence, not universal expected output.

**Local target only, mutation after reviewing its local report:**

```sh
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file data/repairs/historical.local.sql --json
```

Repeat the same local apply and audit to verify idempotency. Existing official
keys win; non-PIHPS primary-key conflicts abort planning or the guarded SQL
statement. A `malformed JSON` runtime error in that guard means a conflicting
source arrived after planning: stop and regenerate the baseline/report. Prior
successful chunks remain resumable. Statements remain below 90 KB to respect
D1's 100 KB SQL limit. Never apply historical SQL outside the audited range.

An explicit SQLite baseline is another **local, read-only dry-run** path:

```sh
rtk rg --files --hidden --no-ignore .wrangler/state/v3/d1 -g '*.sqlite'
rtk pnpm history:pihps:restore --from 2017-03-27 --to 2026-09-15 --target local --dry-run --existing-db /absolute/path/to/local-d1.sqlite --out data/repairs/historical-repeat.local.sql
rtk pnpm exec node docs/qa/pr12/verify-history.mjs /absolute/path/to/local-d1.sqlite data/repairs/prices-before.local.json
```

Select the intended database file explicitly. Keep the pre-import export for
the checksum helper; a post-import export cannot prove preservation across the
first import. SQLite paths must never be used as evidence of remote state.

For repair from verified original raw files, use the same baseline/target
contract and an explicit small range. This example performs no source HTTP:

```sh
rtk pnpm exec node scripts/seed-d1.mjs --raw-dir data/raw --from 2026-10-16 --to 2026-10-16 --target local --dry-run --existing-json data/repairs/prices-before.local.json --coverage-json data/repairs/coverage-before.local.json --out data/repairs/raw-2026-10-16.local.sql
```

Only validated original scopes establish completion. Raw `fetchedAt` in Jakarta
determines same-day pending versus later confirmed empty. Derived observations,
legacy snapshots, failed scopes and retained fallback cells cannot establish
empty holidays. CLI HTTP recovery, when separately needed, uses
`rtk pnpm run scrape:pihps -- 2026-10-16 2026-10-16 --force`; it performs source
requests and was not run in health verification. The CLI has bounded retries
and a full-outage wait unlike the scheduled Worker.

**Remote target, read-only exports and dry run only:**

```sh
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --remote --command 'SELECT * FROM prices_daily ORDER BY date, commodity_id, region_code, level' --json > data/repairs/prices-before.remote.json
rtk proxy pnpm exec wrangler d1 execute monitor-pangan --remote --command 'SELECT * FROM source_days ORDER BY date, source_id' --json > data/repairs/coverage-before.remote.json
rtk pnpm history:pihps:restore --from 2017-03-27 --to 2026-09-15 --target remote --dry-run --existing-json data/repairs/prices-before.remote.json --coverage-json data/repairs/coverage-before.remote.json --out data/repairs/historical.remote.sql
```

`--target remote` labels the report; it does not connect or write. A reviewed
remote report, fresh remote baseline and separately authorized production apply
are required for rollout. No remote import or deployment was performed by this
change. Do not substitute a local baseline or report.

## Deployment trigger verification

For a separately authorized rollout, deploy the existing custom Worker from
the repository root after the required typecheck/tests/build. No new scheduler
or paid service is needed. **Production mutation, not executed here:**
`rtk pnpm exec wrangler deploy`.

Afterward, **remote read-only** deployment inspection is
`rtk pnpm exec wrangler deployments list --name monitor-pangan --json`.
Read actual Cron Triggers in Cloudflare's Worker Settings / Trigger Events, or
the authenticated read-only API
`GET /accounts/<account-id>/workers/scripts/monitor-pangan/schedules`.
Verify both `MON-FRI` triggers and record the deployed version and timestamp.
Keep credentials out of saved evidence. `wrangler.toml` alone is insufficient.

Read `/api/pihps/health` and `/api/pihps/fresh` from the deployed origin, then
check the next actual scheduled event in Cloudflare logs and D1 `job_runs`.
Match event time, selected date, terminal result, coverage and observed cells.
A served fresh response, a manually exercised handler and an actual scheduled
event are three separate claims. Future events remain pending until observed.

## Troubleshooting

| Symptom | Check and action |
| --- | --- |
| Health 503 `unavailable` | Read sanitized `pihps_health_unavailable` logs; check D1 binding/schema/access and malformed timestamps/states. It is not an empty holiday. |
| Health 503 `degraded` | Inspect `oldestUnresolvedDate`, last attempt and last successful run. Audit the older missing weekday even when today's prices exist. Repair the specific cause/range. |
| Stale prices with health `ok` | Compare checked/priced dates. Completed empty surveys can leave the last observation older; do not fill missing prices. Check selected commodity/province too. |
| `waiting` / `pending` | Before 17:45 WIB, allow scheduled publication checks. After the deadline it is degraded; later successful zero-cell evidence can finalize the prior day as empty. |
| Latest attempt `error` | Earlier readable prices remain usable but do not prove the latest invocation succeeded. Inspect job/log category and next successful invocation. |
| Freshness 503 while HTML loads | The overlay is unavailable, not confirmed empty. HTML logs identify that fallback; preserve the browser's last usable overlay on failed refresh. |
| Missing/corrupt archive | Restore the tracked `data/history/pihps/` files from the reviewed branch, then run `pnpm history:pihps:validate`. Do not bypass a failed hash/schema check, substitute a moving branch tip or infer holidays from omissions. |
| Missing account access | Continue isolated local fixtures; record production audit/deployment/cron checks as pending until access returns. |

## Exercised evidence and remaining gates

On 19 October 2026, [the production audit](../qa/pr12/data-audit.md) found
8,040 official cells / 24 dates, 23 markers and 55 jobs. Historical production
import and corrected trigger deployment remain unapplied. Separately,
[local import evidence](../qa/pr12/history-import.json) records 799,466 cells /
2,473 dates after restoration, unchanged recent rows/markers/jobs and a zero-write
SQL replay. [Health fixture evidence](../qa/pr12/pipeline-health.json) records
isolated SQLite/D1-adapter HTTP responses plus a separately labeled actual local
Wrangler health capture. [Runtime QA](../qa/pr12/runtime-verification.md) records
actual Wrangler APIs/assets and desktop/mobile checks. [Controlled scheduler QA](../qa/pr12/cron-verification.md)
records handler/state/job/health agreement without source HTTP. Neither is a
deployed cron result. The [production rollout checklist](../qa/pr12/production-rollout.md)
requires actual account-tier/quota verification before a scoped historical repair,
then authorized apply/deployment and actual trigger/event readback.

Commands exercised for this health change:

```sh
rtk pnpm exec vitest run src/worker/pihps-health.test.ts src/worker/price-http.test.ts src/worker/index.test.ts src/worker/ingest.test.ts src/worker/d1-store.test.ts
rtk pnpm typecheck
rtk pnpm build
```

The archive recovery, initial local SQL apply, duplicate local apply and checksum
helper were exercised during historical repair; their dated results are linked
above. Baseline paths in this runbook are reusable examples, not a claim that a
clean checkout already contains this session's ignored files.

## Repository archive verification (#37)

[Archive verification](../qa/issue-37/verification.md) records clean-checkout
restoration from tracked files, both 38-province fixtures, Rp 50 rounding,
zero-write replay and unchanged newer observations/day/job metadata. The original
#36 production audit and deployment gates above remain dated, separate evidence.
