# Task 7 implementation report

Status: DONE_WITH_CONCERNS. Base: `c62ccc1`. Implementation, fixture evidence and
runbook are ready for parent spec/quality review. Actual Wrangler health/browser
captures are reserved for Task 8; production writes/deployment and future cron
observation remain unapplied/unverified.

## Result and engineering decisions

- Added `GET /api/pihps/health` to the current custom Worker. Public reports are
  Schema-decoded; GET responses are no-store. `ok`/`waiting` return 200,
  `degraded`/`unavailable` return 503, and mutation methods return 405.
- D1 remains the evidence owner. A separate health read capability shares the
  existing `priceReadStoreLayer` query boundary without expanding snapshot/trend
  service mocks. Coverage is limited to dates strictly after the static cutoff
  through Jakarta today. All eligible weekdays are considered, so today's price
  cannot conceal Friday's unresolved marker. Live/empty markers set checked date;
  actual retail observations set priced date; these are independent facts.
- Latest official prices use ten indexed backwards seeks, one per canonical
  commodity, returning at most ten validated rows. This avoids aggregating all
  799,466 historical observations on each health request. Local Wrangler EXPLAIN
  confirms `prices_daily_trend` with commodity/source/level/date constraints.
- Bounded job queries retrieve the latest attempt and latest successful
  invocation separately. Missing successful-run evidence is degraded; latest
  `failed` and `error` normalize to public error and stay degraded until a newer
  complete invocation. Job strings use canonical UTC ISO validation, accepting
  whole-second and three-digit-millisecond existing formats. SQL orders by
  instant rather than lexicographically; malformed instants surface and fail
  decoding rather than being hidden by a valid older row.
- 17:45 WIB / 10:45 UTC is the observation deadline. Today's pending/missing
  survey can wait before it; older gaps and unsuccessful automation never get
  that grace. Completed empty holidays and weekends need no invented prices.
- Fixed the real freshness boundary defects: `freshSince` previously omitted
  `level='eceran'` and trusted typed database output. It now decodes dates,
  commodities, regions and finite positive observations with Schema, filters the
  retail lane, and decodes its public payload. `/api/pihps/fresh` failures now
  return sanitized 503 JSON rather than successful empty data. Invalid civil
  query dates are rejected. HTML still serves while omitting an unavailable
  overlay and logging a sanitized API/HTML availability event. Existing browser
  refresh rejects non-2xx before applying a new overlay.
- Wrote the current operations runbook and executable read-only audit SQL.
  Commands distinguish local and remote, raw/derived inputs, dry-run/apply and
  actual cron/deployed-trigger evidence. Durable ignored baselines live under
  `data/repairs`, not the session ledger. Clean checkout recovery fetches the
  immutable Git object before extraction; parent verified that exact fetch
  against origin. Existing current prices, Rp50 mean policy, D1 binding,
  citizen/R2 routes and asset behavior remain intact.
- Updated DATA_SOURCES to identify the already-live PIHPS lane separately from
  optional Panel Harga access. Historical counts retain their verification date.
  The old design document only gains a historical-status/link notice.

## Red / green evidence

1. `rtk pnpm exec vitest run src/worker/pihps-health.test.ts`
   - RED: 9 failed. The unimplemented route returned the asset shell, 200 instead
     of degraded/unavailable 503 and no no-store header.
   - GREEN after endpoint/read implementation: 9 passed.
2. `rtk pnpm exec vitest run src/worker/d1-store.test.ts src/worker/index.test.ts`
   - RED: 2 failed / 9 passed. Wholesale row leaked into freshness and read
     failure returned HTTP200 instead of503.
   - GREEN with health suite included: 20 passed across3 files.
3. Added mixed-precision job-order regression; health suite RED 1 failed /
   9 passed (older whole-second success incorrectly outranked millisecond error).
   GREEN after ordering by instant:10 passed.
4. Added malformed latest official infinite-price regression; health suite RED
   1 failed /10 passed (invalid observation yielded healthy). GREEN after raw
   candidate price decoding:11 passed.

Final required and expanded targeted command:

```sh
rtk pnpm exec vitest run src/worker/pihps-health.test.ts src/worker/price-http.test.ts src/worker/index.test.ts src/worker/ingest.test.ts src/worker/d1-store.test.ts src/worker/price-store.test.ts
```

Result: **6 files /63 tests passed**, no failures. Expected failure-path logs
identify freshness API/HTML unavailable and ingestion StoreError. No source
HTTP requests or shared local fixture mutations were made by the tests.

- `rtk pnpm typecheck`: exit0, `TypeScript: No errors found`.
- `rtk pnpm build`: exit0; client/SSR builds and all6 prerendered pages passed.
  Existing TanStack circular module warning and >500KB bundle warnings remain.
- `rtk git diff --check`: exit0, no whitespace problems.
- A pnpm/Node local-link check resolved every relative link in the runbook,
  DATA_SOURCES and historical design notice.
- `rtk pnpm exec wrangler d1 execute monitor-pangan --local --file docs/operations/pihps-audit.sql --json`:
  exit0, all5 queries succeeded. Per-year cells agree with combined799466 rows;
  23 existing live markers; bounded jobs retain original history; missing daily
  weekday query returned[]; fixture beras dates each have34 priced cells, and
  2026-09-16 has31.
- Local Wrangler read-only `EXPLAIN QUERY PLAN` for the health candidate query:
  `SEARCH prices_daily USING INDEX prices_daily_trend (commodity_id=? AND source_id=? AND level=? AND date<?)`.
- `rtk pnpm exec wrangler deployments list --help`: verified documented CLI
  supports `--name` and `--json`; no remote deployment call was made.
- `rtk pnpm exec node --version`: v24.18.1.

## Sanitized health capture

`docs/qa/pr12/pipeline-health.json` was generated from actual HTTP dispatcher
responses against isolated in-memory SQLite executing production SQL with
TestClock. The ignored local driver was
`data/repairs/capture-pipeline-health.mjs`, run through pnpm/Node strip-types.
It captured waiting200, pending-at-deadline503, live200, holiday-empty200,
legacy-failed503 and unavailable503 with exact sanitized JSON and no-store.
It also records the real local Wrangler query plan and explicit pending runtime
gates. This is **D1-adapter fixture evidence, not actual Wrangler endpoint or
production cron evidence**. Parent Task8 will append real local Worker/browser
evidence rather than silently upgrading that claim.

## Self-review and remaining gates

- Public output contains no SQL, exceptions, job notes, secrets or admin data.
  Unavailable reads clear only report observations, never data. Existing good
  prices and stored history remain untouched.
- Test expectations cover cutoff/deadline, older gaps, checked versus priced,
  weekend/empty, both legacy/current failures, later success, absent jobs,
  malformed evidence and D1 read failure. Existing snapshot/trend/citizen/admin/
  asset tests continue passing.
- No generated frontend files, production data, deployed schedules, original
  architecture, dashboard or paid dependency changed. Local read-only SQL
  against the restored database was the only nonfixture D1 action in this task.
- The Effect package does not contain `node_modules/effect/AGENTS.md`; read the
  repo Effect skill, nearby production/test patterns and relevant DateTime API
  source instead. No dependency installation/change was needed.
- Parent confirmed it owns independent Task7 spec+quality reviewers immediately
  after this handoff, plus whole-branch review after Task8. No duplicate review
  agent spawned.
- Remaining: actual Wrangler endpoint/browser captures, parent independent
  review, final branch gates, separately authorized remote backfill/deployment,
  readback of deployed MON-FRI triggers and the next real cron event. The full
  suite was not run here because repo instructions require targeted files.

## Review fix round 1 (base `8ae30fa`)

Resolved the Important bounded job-read finding in `task-7-review.md`. Returning
one row did not bound the work: the exact chronological expression required a
full job scan and temporary sort. Added `job_runs_health_attempt` on source,
instant expression and descending id, plus `job_runs_health_success` on source,
status, instant expression and descending id. Both `db/schema.sql` and Worker
cold migration create them. The existing queries and malformed/mixed-precision
ordering semantics remain unchanged. The success query seeks both source and
status, so it does not walk through arbitrary preceding failures to find success.

Added an EXPLAIN regression capturing the two actual queries emitted by the
Worker health dispatcher. It checks the Worker migration and independently
recreated standalone-schema indexes, rejects full scans/temporary sorts and
requires source/status equality for the success lookup. Updated the cold-start
budget test to execute migration, coverage read, a full340-cell day and a job
record against the actual50-query limit, replacing the arbitrary12-statement
migration cap. The runbook now identifies the indexes and exact bounded access
strategy; pipeline-health.json includes the four fixture query plans.

Exact red/green commands and outputs:

```sh
rtk pnpm exec vitest run src/worker/pihps-health.test.ts src/worker/d1-store.test.ts
```

RED before index changes:2 failed /17 passed. Both schema paths reported
`SCAN job_runs` and `USE TEMP B-TREE FOR ORDER BY`. GREEN after index changes:
2 files /19 tests passed, including existing malformed-timestamp, mixed-precision
and legacy/current error normalization cases.

```sh
rtk pnpm exec node --experimental-strip-types data/repairs/capture-job-query-plans.mjs
```

Exit0. The ignored driver captured actual production SQL against an isolated
in-memory SQLite fixture. Both schema entry points produced exactly:

```text
SEARCH job_runs USING INDEX job_runs_health_attempt (source_id=?)
SEARCH job_runs USING INDEX job_runs_health_success (source_id=? AND status=?)
```

There were no full scans or temporary sorts. These are isolated schema/SQL
fixture plans, not a claim that remote indexes were applied.

Final verification commands:

```sh
rtk pnpm exec vitest run src/worker/pihps-health.test.ts src/worker/d1-store.test.ts src/worker/price-store.test.ts src/worker/index.test.ts src/worker/price-http.test.ts src/worker/ingest.test.ts
rtk pnpm exec vitest run src/worker/laporan-store.test.ts scripts/price-import.test.mjs
rtk pnpm typecheck
rtk pnpm build
rtk git diff --check
```

Outputs: first suite6 files /65 tests passed; schema consumers2 files /28 tests
passed. Typecheck exit0 (`TypeScript: No errors found`). Build exit0, client/SSR
and all6 prerendered pages passed; existing circular-module and bundle-size
warnings remain. Diff check exit0. No production writes, source HTTP, shared
local D1 mutation or deployment occurred. Parent review and Task8 runtime/browser
evidence remain pending; earlier production rollout gates remain unchanged.
