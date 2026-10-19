# PR #12 Historical Prices and Data Operations Implementation Plan

> **Status:** All eight authorized tasks completed on 19 October 2026, including final code review and replacement draft [PR #36](https://github.com/naufaldi/monitor-pangan/pull/36). Original #12 remains open. Production rollout is separate and pending authorization.
> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task after design approval. Steps use checkboxes for tracking. Create an isolated worktree at execution time using `superpowers:using-git-worktrees`.

**Goal:** Make historical PIHPS dates show verified prices or honest request states, and standardize how backfill, scheduled ingestion, coverage, recovery, and operational documentation keep those prices trustworthy.

**Architecture:** Port the useful changes from PR #12 onto current `main`, preserving its custom Worker. D1 is the serving store; the raw archive is provenance and recovery input; frontend bundles are derived observations with explicit date coverage. Add validated snapshot/trend reads, bounded weekday ingestion, and a small read-only health endpoint to that same Worker, with one operations runbook for auditing and repair.

**Tech Stack:** Existing TanStack Start/Router, React 19, Effect, Effect Schema, Cloudflare Worker/D1, Wrangler, `@effect/vitest`, and `@monitor-pangan/ui`. Use pnpm from the repo root and prefix shell commands with `rtk`.

**Execution clarification:** The user subsequently did not know the original archive location and asked to check the codebase. Recovery found immutable derived yearly files on PR #14; the user was informed before extraction. See `docs/qa/pr12/data-audit.md` and `repair-manifest.json` for verified counts, hashes, proposed dates, and limitations. Import those recovered observations only; they cannot prove historical HTTP scope completion or justify manufactured `source_days` markers. This reuses stored data, not PR #14's code or rounding policy.

## Evidence and decisions

- Reviewed base: `main` / `ebe1555cb4054196259b3bf0b0896371a7679dac`.
- Reviewed PR #12 head: `10ce1fa8420d020a778a497c5cd9e2e5d67eeacd`, branch `cursor/fix-empty-price-data-de7c`.
- The current provider lists 2,450 live survey dates, but `LIVE_PRICES` contains only 29 dates, 2026-08-07 through 2026-09-16. For example, 2025-10-30 is listed as live but has no bundled cells. The provider currently turns an empty set into `nationalAvg = 0`.
- Current production architecture uses `src/worker/index.ts`, a real D1 binding, freshness HTML injection, citizen-report routes, R2, and weekday ingest. PR #12's old Start server entry and placeholder database identifier do not belong in the rebuilt change.
- The old trend handler applies independent limits to national and provincial series while deriving a cursor from national dates. Sparse provincial series can cross a page boundary and repeat points.
- `StatusMessage`, `Button`, and other shared UI pieces already exist in `@monitor-pangan/ui`.
- `data/raw/` and yearly `data/snapshots/YYYY.json` files are absent from this checkout. The user selected **restore the existing backfill archive** for local provenance and fixtures. Its path has not been supplied. Audit production read-only first; the missing archive does not establish missing D1 data and does not block independent contract, API, or ingestion work. Do not silently substitute PR #14's data or start a fresh backfill. Archive-based comparisons remain incomplete until it is restored.
- Follow-up runtime check on 2026-10-19: `GET https://monitor.naufaldi.com/api/pihps/fresh?after=2026-09-16` returned HTTP 200, `latestDate = 2026-10-19`, 23 dates from 2026-09-17 through 2026-10-19, and 7,730 price cells. Production has recent observations; missing local files do not establish missing remote history. Audit remote D1 coverage before planning any production import. This endpoint response alone does not prove which cron executions populated those rows.
- The configured trigger times are 07:15 and 10:15 UTC, or 14:15 and 17:15 WIB. Both expressions currently use `1-5`. Cloudflare's current Cron Triggers documentation defines 1 as Sunday and 7 as Saturday, so this numeric range denotes Sunday through Thursday, despite the source comments' weekday intent. Verify the deployed triggers and correct the config to explicit `MON-FRI` during implementation. Reference: https://developers.cloudflare.com/workers/configuration/cron-triggers/ .
- Current ingestion selects dates after `MAX(source_days.date)`. That can hide earlier gaps and means a same-day empty check is not revisited by the later trigger. The scheduled handler also catches and logs failures without rethrowing, while `job_runs` records success paths only. These are concrete recovery/observability gaps to cover in this plan.

**Approach choices:** Porting onto current main is recommended because it preserves the deployed Worker while keeping the useful price behavior. Rebasing all eight old commits would require resolving obsolete routing/configuration choices and still auditing the result. An empty-state-only patch would stop fake zero prices but leave historical dates unusable; it does not satisfy this plan.

## Global constraints

- Preserve the current Worker entry, D1 identifier, routes, ASSETS/PHOTOS bindings, secrets configuration, HTML freshness injection, and twice-daily ingestion times. Audit deployed cron triggers and replace ambiguous numeric weekdays with explicit `MON-FRI` to match the intended Monday-Friday schedule.
- Keep PR #14's nearest-rupiah policy, yearly series files, and daily/yearly comparisons outside this change. API and bundle calculations retain the existing Rp 50 rounding policy.
- Official prices come only from PIHPS `prices_daily` rows with `source_id = 'pihps'` and `level = 'eceran'`. Citizen reports never enter these calculations.
- Missing province prices remain null. No official-date mock fill. Preserve explicitly labeled sample behavior in the existing provider without adding sample dates to the live picker.
- Query strings, D1 outputs, and HTTP JSON are external inputs. Parse with Schema and expose typed failures. New Effect programs follow the repo's conventions.
- All UI status/error/retry controls use shared components. No new styling system or unrelated UI refactor.
- Do not edit generated route/data files manually. Regenerate only when an actual source change requires it.
- Tests use `@effect/vitest`, `it.effect`/`it.live`, and `assert`. Run explicit test-file targets, not watch mode or an unrestricted full suite.
- Implementation runs in a new branch from current main. Open a replacement draft PR referencing #12 after verification; keep #12 open until the replacement merges. Do not rewrite the old branch or merge/close PRs as part of the planning step.
- No automatic weekly full-history scrape, second scheduler, new dashboard, paid monitoring dependency, or new data source. Ongoing ingestion is bounded daily work; historical repair is an explicit, audited range operation.

## Standard operating rules

**Storage responsibilities:** PIHPS observations are served from D1. Raw files establish source provenance and support recovery; they are not proof of what production currently holds. Snapshot/trend bundles are derived data, not a second independently updated source of truth. Citizen prices remain a separate lane.

**Schedule:** Use `15 7 * * MON-FRI` and `15 10 * * MON-FRI`, documented as 14:15 and 17:15 Asia/Jakarta. Keep one survey date and 34 provincial requests per invocation, with existing concurrency 5. Do not add immediate Worker retries that can breach the subrequest budget; later scheduled invocations perform retries. The CLI may use its bounded retry/backoff policy for explicit archive repair.

**Day states:** Store `live`, `empty`, `pending`, or `error` in `source_days.status`. `live` means a completed valid check with provincial observations. `empty` means an older date was checked successfully across every surveyed province and still contained no observations. `pending` covers an all-empty check of today's date, so the 17:15 run can try again. `error` means a source/parse/store attempt failed; it is not evidence of an empty survey. Existing `live`/`empty` rows remain supported, but legacy empty markers for recent dates must be audited before being treated as definitive.

**Date selection:** Derive eligible weekdays between `STATIC_LIVE_THROUGH + 1 day` and today in Asia/Jakarta. Select the oldest missing, pending, or error day; a later completed date must not hide it. With no unresolved older day, refresh today's weekday even when the first trigger already found some live prices. An all-empty date stays pending while it is today; after a later day's successful all-empty check it may become empty. Historical gaps before the static cutoff belong to the separate audited repair command, not the scheduled catch-up loop.

**Writes and retries:** A complete day marker is written only after all required source responses have parsed and all price batches have succeeded. A partially written day must be retryable. Repeated/overlapping runs converge through the existing price key; a failed or empty retry cannot erase observed cells or downgrade a live marker. Keep the existing checked-at timestamp as attempt metadata and use status, not timestamp existence, to determine completion.

**Operational dates:** Report latest successful checked date, latest date with actual prices, oldest unresolved date, last attempt time/outcome, and last successful attempt separately. Never call the pipeline healthy solely because the maximum date is recent. After the 17:15 run plus a 30-minute observation window, an unresolved eligible day is degraded; a successfully checked older empty holiday is resolved even when the last actual price is earlier. Database unavailability is unavailable, not an empty/healthy response.

**Evidence:** Every execution records success or failure in `job_runs` when D1 is reachable and emits structured logs with target date, outcome, source error category, and confirmed row counts. Failure remains a rejected scheduled execution after logging. Account access, freshness responses, D1 coverage, and cron execution history are distinct evidence; record which were actually checked.

**Documentation ownership:** `DATA_SOURCES.md` describes provenance, storage, and the current verified coverage. `docs/operations/pihps.md` owns schedule, audit, repair, deployment checks, and troubleshooting commands. Old design documents are labeled historical and link to this current runbook. Configuration and code own runtime behavior; documentation explains and links to them rather than maintaining an independent schedule.

## Execution order and dependencies

1. Task 1 audits production before any import and separately locates the selected archive. Account access and archive access have separate outcomes.
2. Tasks 2 through 4 deliver honest contracts, Worker reads, and frontend state. Synthetic labeled test fixtures are allowed for failure behavior; historical source comparisons still require the archive.
3. Task 5 fixes scheduled ingestion and observable failures. Task 6 brings explicit archive repair/import under the same data rules.
4. Task 7 finishes the health endpoint and operations documentation. Task 8 verifies the combined result and prepares the replacement PR.

Each task is a reviewable commit. No missing credential or archive may be reported as a successful remote audit or completed source-data comparison. Continue independent work when one evidence source is unavailable.

## State and ownership

The request owner identifies work by date/commodity for snapshots, and commodity/region/range/resolution for trends. A result can update the screen only while its request identity is current. The provider owns calculations and the bundle/fresh overlay; the Worker owns D1 reads and HTTP status mapping; the route owns the user's selection; the archive importer owns coverage evidence.

```ts
type PriceRequest<A> =
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; data: A }
  | { status: 'error'; key: string; kind: 'request' | 'coverage' }

// Change the existing Snapshot contract, rather than retaining a zero sentinel.
type Snapshot = {
  date: string
  commodity: Commodity
  nationalAvg: number | null
  pricedCount: number
  rows: PriceRow[]
}
```

An empty snapshot is a successful, verified result with `pricedCount = 0` and `nationalAvg = null`. An unseeded date, failed request, or invalid payload is not an empty snapshot. Render `Tidak ada data` for confirmed absence and a retry/unavailable message for an unsuccessful load. Use the same distinction for commodity hints and chart summaries.

**Execution preparation:** After approval, refresh origin/main, create the isolated implementation branch, and run `rtk pnpm install --frozen-lockfile` before tests. Read `.agents/skills/effect-ts/SKILL.md`, nearby Effect programs, and the installed Effect guidance before changing Effect code. Do not upgrade dependencies as part of setup. Planning found only this repository's root worktree; a bounded search of WebApps/Downloads found no matching archive before it was stopped, so no archive path has been established.

## Task 1: Audit existing production coverage, then restore the local archive

**User Story:** As the maintainer, I want to know which data already exists in production and which local provenance files are available, so that repair targets actual gaps without replacing good data.

**Files:** Read `DATA_SOURCES.md`, `scripts/normalize.mjs`, `scripts/seed-d1.mjs`, `scripts/export-fresh-sql.mjs`, `db/schema.sql`; record evidence in `docs/qa/pr12/data-audit.md`. Restore ignored `data/raw/` and yearly snapshots locally. Add small sourced fixtures at `src/data/fixtures/pihps-2018-10-09.json` and `src/data/fixtures/pihps-2025-10-30.json` only after checking the archive.

**Interfaces:** Produces verified raw files/year snapshots and a local coverage audit containing dates, non-null provincial cell counts, scope failures, and provenance. Fixtures contain observations from the archive, not manually invented expected prices.

**Edge Cases:** Missing/corrupt archive, national-only rows, partial survey dates, known source-empty holidays, failed HTTP scopes, omitted Papua provinces, a future date, and archive dates overlapping newer D1 observations.

**Definition of Done:** Remote coverage and local archive results are recorded separately. With account access, the audit has per-year counts, date gaps, recent day/job states, and configured trigger history; without access it explicitly remains unverified. Archive restoration/source comparisons are complete only when the two regression dates trace to actual observations. Unavailable archive/account access does not block independent implementation tasks.

- [x] Audit remote D1 read-only before deciding production needs historical seeds: count official provincial cells and distinct dates by year, inspect minimum/maximum dates, compare known fixture dates, inspect `source_days`, and inspect recent `job_runs`. Local archive restoration remains the selected source for fixtures; do not overwrite remote data based on local absence. Record missing access separately from missing data.
- [x] Use these read-only queries through the existing Wrangler/account session and save summarized counts and outcomes, never credentials:

  ```sql
  SELECT substr(date, 1, 4) AS year, COUNT(*) AS cells,
         COUNT(DISTINCT date) AS dates, MIN(date) AS first_date, MAX(date) AS last_date
  FROM prices_daily
  WHERE source_id = 'pihps' AND level = 'eceran' AND price IS NOT NULL
  GROUP BY year ORDER BY year;

  SELECT date, status, checked_at FROM source_days
  WHERE source_id = 'pihps' ORDER BY date DESC LIMIT 40;

  SELECT started_at, status, rows_upserted, note FROM job_runs
  WHERE source_id = 'pihps' ORDER BY id DESC LIMIT 20;
  ```

- [x] Compare date membership against eligible weekdays, not just counts/maxima. Classify known empty dates, unresolved/error dates, missing markers, and rows lacking trustworthy coverage. A Friday gap must remain visible even when Monday has prices.
- [x] Inspect deployed Cron Triggers and recent execution outcomes separately from the public freshness response. Record the inspection timestamp and what could be verified.
- [x] Locate the existing archive. Check linked worktrees and bounded project/download locations; accept a user-provided path when available. Do not overwrite any existing raw files while locating/restoring it.
- [x] Inspect and stage the recovered archive; validate dates, region codes, commodities and positive finite observations. **Execution adaptation:** pinned derived files were recovered per the clarification above. Original raw HTTP scope statuses remain unavailable and were not invented.
- [x] Count verified dates and provincial cells by year. Separate confirmed empty dates from unknown/error dates. Do not infer a successful empty scrape merely from missing rows.
- [x] Extract the two historical fixtures and document their provenance. Record all 38 expected snapshot cells, including null cells, from the actual source data.
- [x] Identify which historical dates have trustworthy day-level coverage markers for the import in Task 6. Create an explicit repair list only for proven production gaps; an empty repair list means no remote reseed. Keep this audit out of generated frontend bundles until explicitly regenerated.

**Execution evidence:** Audit and derived-archive recovery reviewed and complete: `docs/qa/pr12/data-audit.md`, `repair-manifest.json`, commits `2fe6e96` and `d6f5f15`. The original raw archive remains unavailable; recovered observations cannot prove original HTTP scope completion. Proposed production repair remains unapplied.

## Task 2: Make empty price data explicit in the shared contract

**User Story:** As a reader, I want missing prices to appear as missing, so that I never mistake an empty response for a free commodity.

**Files:** Modify `src/data/provider.ts`, `src/data/price-schema.ts`, `src/data/provider.effect.ts` only where required, and affected callers in `src/components/MapView.tsx`, `src/components/PriceTable.tsx`, `src/components/ProvincePanel.tsx`. Add `src/data/price-summary.ts` and `src/data/price-summary.test.ts`. Update `src/data/provider.test.ts`, `src/data/provider.effect.test.ts`, and `src/data/price-schema.test.ts`.

**Interfaces:** `summarizePrices(rows: readonly PriceRow[]): { nationalAvg: number | null; pricedCount: number }`, used by bundle and API paths. `Snapshot` and `SnapshotSchema` agree on nullable average and priced count. Existing valid numbers and price units retain their behavior.

**Edge Cases:** All-null rows, one observation, partial coverage, non-finite/zero/negative external values, sample dates, fresh overlay updates, and null averages passed to map/table comparisons.

**Definition of Done:** No empty calculation produces a displayed zero; null averages cannot yield a fabricated percentage, extrema, or map band. Existing live and sample-provider tests pass.

- [x] Add failing tests for the empty/partial summaries and the historical bundle gap. Include this core regression:

  ```ts
  it.effect('an empty set has no national price', () => Effect.sync(() => {
    assert.deepStrictEqual(summarizePrices([{ regionCode: '31', price: null }]), {
      nationalAvg: null,
      pricedCount: 0,
    })
  }))
  ```

- [x] Run the targeted tests and confirm the new assertions fail before implementing the contract change.
- [x] Implement the single summary helper. Apply `Math.round(mean / 50) * 50` only to a non-empty set of valid observations. Add schema refinements so `pricedCount`, rows, and null/non-null average cannot contradict each other in decoded API payloads.
- [x] Update presentational props to accept an absent average where needed. Hide relative percentages/extrema when their inputs are missing; retain map selection, table sorting, and null-price rows.
- [x] Keep synchronous provider reads restricted to dates the bundle/fresh overlay actually contains when rendering official snapshots. A live date in metadata alone is not proof that its prices are loaded.
- [x] Run `rtk pnpm exec vitest run src/data/price-summary.test.ts src/data/provider.test.ts src/data/provider.effect.test.ts src/data/price-schema.test.ts` and `rtk pnpm typecheck`; commit the coherent contract change on the implementation branch.

**Execution evidence:** Contract and invalid-fresh-value repair reviewed, commits `c704118` and `688eabe`. 33 targeted tests, typecheck, and build passed.

## Task 3: Add validated price reads to the existing Worker

**User Story:** As a reader of historical maps and daily charts, I want date-scoped D1 reads with stable pagination, so that history loads completely without repeated or invented observations.

**Files:** Create `src/worker/price-store.ts`, `src/worker/price-http.ts`, `src/worker/price-store.test.ts`, `src/worker/price-http.test.ts`, and `src/worker/index.test.ts`. Extend `src/data/price-schema.ts`; modify `src/worker/index.ts` to compose the new handler/layer and `src/worker/d1-store.ts` only to expose reusable migration support if necessary.

**Interfaces:**

- `PriceReadStore` is an Effect Context.Tag with a D1 Layer. It exposes `snapshot(date, commodityId)` and `trendPage({ commodityId, regionCode, from, to, cursor, limit })` as typed Effects.
- `handlePriceRequest(request)` returns a Response for `/api/snapshot` and `/api/trend`, or null for unrelated paths, following the existing citizen-handler composition pattern.
- `GET /api/snapshot?date=YYYY-MM-DD&commodity=ID` returns a schema-valid Snapshot, with 38 unique region rows in canonical order.
- `GET /api/trend?commodity=ID&region=CODE&from=YYYY-MM-DD&to=YYYY-MM-DD&cursor=YYYY-MM-DD&limit=N` returns `{ national: TrendPoint[], selected: TrendPoint[] | null, nextCursor: string | null }`. Region/cursor/limit are optional; default limit is 500 and allowed limits are 1 through 2000.
- Invalid calendar dates, commodities, regions, ranges, limits, or cursors return 400. Unsupported methods return 405. Store/decode failures return a safe 500 response. Missing required historical coverage returns 503 with a stable `coverage_unavailable` code. A verified empty survey returns 200 with explicit empty data.

**Edge Cases:** Sparse provinces, zero points, one point, a final page exactly equal to the limit, cursor at the range end, out-of-range cursor, malformed DB rows, duplicate source/level rows, and missing day coverage.

**Definition of Done:** The API returns real D1 observations, source/level isolation is tested, HTTP failures remain distinguishable from empty data, and concatenating every page yields sorted unique dates in both series.

- [x] Add failing HTTP/store tests using typed Layers and local SQLite/D1 fixture data. Verify queries against actual local D1 as well as handler tests; a mock returning canned results is insufficient proof of pagination SQL.
- [x] Validate canonical civil dates with an actual calendar round trip, not just a regex. Validate region membership against the project's province catalog and `from <= to`; reject cursors outside the requested interval.
- [x] Select only official PIHPS eceran rows. Snapshot reads use the canonical 38-province grid and the shared summary helper. Check trusted day coverage before reporting an entirely absent date as empty.
- [x] Implement pagination with one authoritative national-date window. Fetch `limit + 1` national dates, emit the first `limit`, then bound provincial reads to exactly that page:

  ```sql
  -- Both queries also filter commodity_id, source_id = 'pihps', level = 'eceran'.
  -- national: date >= :from AND date <= :to AND date > :cursor
  --           GROUP BY date HAVING AVG(price) IS NOT NULL
  --           ORDER BY date LIMIT :limitPlusOne
  -- selected: date >= :from AND date <= :pageEnd AND date > :cursor
  --           AND region_code = :region AND price IS NOT NULL ORDER BY date
  ```

  Omit the cursor predicate on the first page. When no national dates exist, return empty series and null cursor. Return the last emitted national date as `nextCursor` only when the lookahead proves another page exists.

- [x] Reproduce the sparse-series bug as a regression: national dates Sep 1/2/3/4 and provincial dates Sep 2/3, limit 2. Page 1's province dates must be `[Sep 2]`, page 2 `[Sep 3]`; no point may repeat or fall outside its national page.
- [x] Compose the handler into the existing Worker without changing deployment architecture. Add route tests proving freshness JSON, HTML injection, citizen/admin dispatch, and asset delivery still reach their existing handlers.
- [x] Run `rtk pnpm exec vitest run src/worker/price-store.test.ts src/worker/price-http.test.ts src/worker/index.test.ts src/worker/d1-store.test.ts src/worker/ingest.test.ts` and `rtk pnpm typecheck`; commit the Worker read path.

**Execution evidence:** Worker read APIs reviewed, commit `f5140b9`. 48 tests across seven targeted files, typecheck, and build passed. Tests execute production SQL against SQLite; real Wrangler/D1 checks remain Task 8.

## Task 4: Connect historical selections to explicit request states

**User Story:** As a reader changing dates or commodities, I want the map, chart, and date labels to describe the same request, so that slow responses or failures cannot show the wrong prices.

**Files:** Create `src/data/api-client.ts`, `src/data/api-client.test.ts`, `src/data/price-request.ts`, and `src/data/price-request.test.ts`. Modify `src/routes/index.tsx`, `src/routes/tren.tsx`, `src/routes/__root.tsx`, `src/data/vintage.tsx`, `src/lib/commodity-search.ts`, and `src/lib/commodity-search.test.ts`. Update `src/lib/source-copy.test.ts` and relevant existing presentation files only as needed.

**Interfaces:** `fetchSnapshot(date, commodityId)` and `fetchTrend(commodityId, regionCode, range)` are schema-decoded Effects. The trend client follows cursors to completion and fails visibly on a non-advancing cursor or a safety-bound breach rather than returning a silently truncated series. `PriceRequest<A>` uses the union above. A home-specific search parser accepts `komoditas` and a valid selectable `tanggal`; other routes retain their current search contract.

**Edge Cases:** Fast A-to-B changes, stale failures after newer success, unmount during fetch, rapid retry, malformed JSON, offline/network failure, confirmed empty day, unknown/unseeded history, fresh overlay arriving while an older date is pinned, and direct URL/back/forward navigation.

**Definition of Done:** Historical dates load through D1, stale responses cannot replace the current selection, errors have a working retry, and no loading/error state renders as an official missing survey or `Rp 0`. Home header/footer/date picker agree on the viewed date.

- [x] Add failing client/state tests for response decoding, retry, and stale-result rejection. An action tagged with key A must not change ready data belonging to key B; test success and failure arrivals in both orders.
- [x] Implement Effect-based requests using `Effect.tryPromise`, typed failures, and schema decoding, with fetch interruption wired to cancellation where supported. Keep mutable presentation arrays behind the client conversion rather than forcing a broad readonly migration.
- [x] Choose bundle/fresh data only when present for the exact request. Fetch historical snapshots and day charts otherwise. API failures show a retry state; do not add an automatic offline substitute that hides failure. Existing week/month bundles and their fresh-period updates continue to serve those resolutions.
- [x] Store the home selection in `?tanggal`. An absent date follows the latest live day; an explicit historical date stays pinned when freshness updates. Reject invalid/unselectable query dates by replacing the URL with the canonical latest selection. Preserve commodity search and back/forward behavior.
- [x] Derive the home header badge from the same selected date as its data. Keep the existing latest-data badge behavior on other PIHPS routes and hide it on citizen/admin routes as today. Include freshness revision in any memo that reads the live overlay.
- [x] Render loading, unavailable/error, and confirmed-empty states through `StatusMessage` and shared retry `Button`. Show no relative statistics without a price. Omit unloaded commodity hints instead of issuing ten extra requests or showing zero hints.
- [x] Run `rtk pnpm exec vitest run src/data/api-client.test.ts src/data/price-request.test.ts src/lib/commodity-search.test.ts src/lib/source-copy.test.ts src/lib/chart-summary.test.ts src/lib/chart-marks.test.ts src/lib/daya-beli.test.ts` and `rtk pnpm typecheck`; commit the route integration.

**Execution evidence:** Historical client/state/URL integration reviewed, commit `2074298`; 42 targeted tests, typecheck and build passed. Mounted browser/history behavior remains Task 8.

## Task 5: Standardize scheduled ingestion, retries, and failure records

**User Story:** As the maintainer, I want every scheduled run to select the correct unresolved survey day and report its real outcome, so that missing or late data can recover without silently skipping dates.

**Files:** Create `src/worker/ingest-plan.ts` and `src/worker/ingest-plan.test.ts`; modify `src/worker/ingest.ts`, `src/worker/d1-store.ts`, `src/worker/index.ts`, `wrangler.toml`, `src/worker/ingest.test.ts`, `src/worker/d1-store.test.ts`, and `src/worker/index.test.ts`. Add `src/worker/ingest-state.test.ts` for store transitions against local SQLite/D1.

**Interfaces:** `CoverageDay = { date: string; status: 'live' | 'empty' | 'pending' | 'error' }`. Export `planIngestDate(today: string, staticThrough: string, days: readonly CoverageDay[]): string | null` and `classifySuccessfulDay(date: string, today: string, pricedCount: number): 'live' | 'pending' | 'empty'`. Extend `PriceStore` with `coverageSince(after: string)` returning validated day records; update its existing `upsertDay` to support the four day states while preserving completed live observations. Remove the maximum-date shortcut from date selection. Keep `ingestRecent(CRON_MAX_DAYS)` as the scheduled entry, with `CRON_MAX_DAYS = 1`.

**Edge Cases:** Friday/weekend/Monday boundaries, a historical gap before a later live marker, today's initially empty response becoming live at the second trigger, a confirmed older empty holiday, network/parse failures, failure halfway through DB batches, repeated invocations, and an empty retry after a successful live run.

**Definition of Done:** The second daily invocation can recover delayed publication; later dates cannot conceal unresolved earlier weekdays after the static cutoff; failed work cannot advance completion or erase good prices; Cloudflare receives a rejected execution on failure and a successful execution on completion. Existing cron request/concurrency limits are retained.

- [x] Add failing pure planner/classification tests, including these assertions using a small explicit state list:

  ```ts
  assert.strictEqual(classifySuccessfulDay('2026-10-19', '2026-10-19', 0), 'pending')
  assert.strictEqual(classifySuccessfulDay('2026-10-16', '2026-10-19', 0), 'empty')
  assert.strictEqual(classifySuccessfulDay('2026-10-19', '2026-10-19', 10), 'live')
  assert.strictEqual(planIngestDate('2026-10-19', '2026-10-15', [
    { date: '2026-10-19', status: 'live' },
  ]), '2026-10-16') // Friday's gap survives a later Monday observation.
  assert.strictEqual(planIngestDate('2026-10-19', '2026-10-15', [
    { date: '2026-10-16', status: 'live' },
    { date: '2026-10-19', status: 'pending' },
  ]), '2026-10-19')
  ```

- [x] Implement the planner from eligible civil weekdays and recorded state, using existing timezone/date helpers. Select one date; do not use `MAX(date)` as a substitute for a coverage scan. A fully caught-up weekend has no target. A caught-up weekday still allows its current date to refresh.
- [x] Make a successful all-empty current-day result pending. Permit the next trigger to recheck it. Only a successful check of an older all-empty date can finalize it as empty. A source/parse exception can never take the successful-empty branch.
- [x] Make the store's state transitions explicit and regression-test them against D1/SQLite: pending/error can become live or confirmed empty; existing live observations survive failed/empty retries; incomplete batches never produce a completed marker. Existing live and empty records are parsed with the same schema as new records. Legacy recent-empty markers identified by the audit get a targeted recheck, not a blanket reset of history.
- [x] Persist one sanitized terminal `job_runs` record per invocation when D1 is reachable, including no-op runs, target date, success/error, and confirmed write counts. Log error category and target date in structured form. If recording the job itself fails, log both failures; never claim a successful job row was written.
- [x] After logging, rethrow the original scheduled failure so Cloudflare marks the invocation failed. Keep an HTTP error mapped to the appropriate response in HTTP handlers; do not confuse that boundary with scheduled execution. Add an Effect failure assertion for the scheduled wrapper.
- [x] Read deployed triggers/history when account access exists. Set `crons = ["15 7 * * MON-FRI", "15 10 * * MON-FRI"]` on the implementation branch. Verify Friday is included and weekends excluded, preserving 14:15/17:15 WIB. Do not add immediate retries or a 60-second wait inside the Worker.
- [x] Run `rtk pnpm exec vitest run src/worker/ingest-plan.test.ts src/worker/ingest-state.test.ts src/worker/ingest.test.ts src/worker/d1-store.test.ts src/worker/index.test.ts`, inspect local D1 transition evidence, and run `rtk pnpm typecheck`; commit the scheduled-ingestion change.

**Execution evidence:** Scheduled ingestion reviewed, commits `3b4dae6` and `ff00491`. Expanded 57-test suite and 29-test fix suite passed with typecheck/build. Real Wrangler started and latest snapshot returned 200; production triggers remain unchanged.

## Task 6: Harden archive repair and prepare an auditable historical import

**User Story:** As the maintainer, I want failed scrapes and incomplete imports to remain visible, so that source outages cannot replace real history or masquerade as empty surveys.

**Files:** Modify `scripts/scrape-pihps.mjs`, `scripts/normalize.mjs`, `scripts/seed-d1.mjs`, `scripts/build-manifests.mjs`, `db/schema.sql`, `src/worker/d1-store.ts`, and `DATA_SOURCES.md` where required. Extract the scraper's testable request/date-writing operations into `scripts/pihps-scrape.mjs`; add `scripts/pihps-scrape.test.mjs` and `scripts/price-import.test.mjs` using `@effect/vitest`. Keep the CLI's existing date/year/range entry points.

**Interfaces:** Raw scopes record `ok`, `source-empty`, or `http-error`; the normalization report records per-date coverage and newest verified live date. The seed generator imports official historical observations and verified `source_days` coverage idempotently. CLI exits are nonzero when HTTP retries are exhausted. Network and sleep operations in the extracted scraper are injectable so regression tests perform no real requests or waits.

**Edge Cases:** All scopes fail, partial failures, invalid HTTP JSON, source-empty holidays, reruns, corrupted existing file, a weaker forced scrape, incomplete yearly archive, and newer D1 rows outside the historical import range.

**Definition of Done:** Failed requests cannot be classified as confirmed source emptiness; good saved cells survive degraded retries; coverage and seed output agree; rerunning the historical import preserves row counts and values; no import changes the citizen lane or newer observations.

- [x] Add failing isolated tests: exhausted HTTP retries, partial failure, all-empty degraded retry over a good file, and repeat import. Capture writes and injected sleeps instead of waiting 60 seconds in tests.
- [x] Port PR #12's per-scope status reporting and coverage report. Surface HTTP failures to the process exit while retaining resumable results and diagnostics. A full-date HTTP outage waits 60 seconds before the next date in the CLI; do not put that sleep inside the production Worker cron.
- [x] Write raw results atomically. Preserve existing observed cells when a new scope fails or returns a degraded empty response. An explicit force option may bypass the skip-existing rule, but may not silently erase good observations after a failed request.
- [x] Generate coverage for every processed date, including partial-error dates with some live cells. Record partial failure even when `liveCells > 0`; do not collapse that case to `ok`.
- [x] Update seed generation to filter/validate PIHPS eceran observations and emit day markers only from verified archive coverage. Do not stamp failed/unknown days as successfully surveyed. Scope the import to the restored historical range, leaving subsequent D1 rows intact.
- [x] Require an explicit inclusive date range for repair/import and produce a dry-run report with planned inserts, updates, existing preserved rows, coverage changes, and unresolved errors before applying SQL. Abort on conflict with a non-PIHPS record sharing the existing primary key. Audit results, not absence of local files, determine whether a production repair is necessary.
- [x] Inspect local D1 query plans for the trend query. Add a named `(commodity_id, source_id, level, date)` index in both schema entry points only when the measured plan needs it; verify the query uses it.
- [x] Apply schema and historical seeds to local D1. Compare all 38 snapshot cells for 2025-10-30 and 2018-10-09 to archive fixtures, then rerun the import and compare counts/checksums. Document exact commands and counts in `DATA_SOURCES.md`.
- [x] Run `rtk pnpm exec vitest run scripts/pihps-scrape.test.mjs scripts/price-import.test.mjs src/worker/d1-store.test.ts src/worker/ingest.test.ts` and `rtk pnpm typecheck`; commit ingestion/import changes.

**Execution evidence:** Repair tooling reviewed through `c62ccc1`. Full local import and zero-write repeat are captured in `docs/qa/pr12/history-import.json`: 791,426 historical observations added, 8,040 recent rows and existing day/job metadata preserved. Two 38-cell fixtures match. Original raw scope evidence remains unavailable.

## Task 7: Expose pipeline health and write the current operations runbook

**User Story:** As the maintainer, I want one documented way to see freshness, coverage gaps, and job failures, so that I can distinguish delayed publication, an empty holiday, and a broken ingestion job.

**Files:** Create `src/worker/pihps-health.ts`, `src/worker/pihps-health.test.ts`, and `docs/operations/pihps.md`. Modify `src/worker/index.ts`, `src/worker/price-store.ts`, `src/worker/index.test.ts`, `DATA_SOURCES.md`, and `docs/superpowers/specs/2026-09-16-monitor-pangan-design.md` for a historical-status notice/link only. Store a sanitized sample report in `docs/qa/pr12/pipeline-health.json` after runtime checks.

**Interfaces:** Add `GET /api/pihps/health` to the existing Worker. Its Schema-decoded payload contains `status: 'ok' | 'waiting' | 'degraded' | 'unavailable'`, `checkedAt`, `latestCheckedDate`, `latestPricedDate`, `oldestUnresolvedDate`, `lastAttemptAt`, `lastAttemptOutcome: 'complete' | 'error' | null`, and `lastSuccessfulRunAt`, with nullable values for unavailable observations. `checkedAt` is the report timestamp; the other fields identify stored evidence. Dates and timestamps are canonical ISO strings. A failed DB read returns HTTP 503 and unavailable state; degraded state also returns 503. Expected waiting before today's deadline returns 200. Return `cache-control: no-store`; expose no secrets, SQL, raw exceptions, or admin data.

**Edge Cases:** Current weekday before/after the 17:45 WIB observation deadline, weekend, confirmed empty holiday, yesterday's unresolved gap despite today's price, a recent failed attempt after an earlier success, no job history, and D1 read failure.

**Definition of Done:** The endpoint and documented queries distinguish recent prices from a healthy ingestion process; observed counts, latest checked date, latest priced date, and run outcomes agree with fixture data. The runbook covers both a clean checkout and operational repair, with UTC/WIB times and dated evidence. Historical design text cannot be mistaken for current production instructions.

- [x] Add failing health tests with `TestClock`: today's pending date before 17:45 is waiting; the same state after 17:45 is degraded; an older unresolved date is degraded at either time; all eligible dates finalized with an older confirmed-empty holiday can be healthy. A last failed attempt is degraded until a successful invocation, even when older prices remain readable. Missing successful job evidence yields degraded status with null successful-run time, rather than verified healthy automation.
- [x] Implement the health query through the existing D1 read service. Read bounded recent job history and scheduled-period coverage; do not scan the entire historical price table on each health request. Derive latest checked date only from completed live/empty markers and latest priced date only from actual official observations. A newer maximum date cannot conceal an older unresolved weekday.
- [x] Keep `/api/pihps/fresh` failures observable too: DB failures return non-2xx JSON rather than an indistinguishable empty-success payload. Preserve HTML asset delivery, but log an unavailable freshness overlay; the browser must not treat a failed refresh as a newly confirmed empty survey.
- [x] Verify the endpoint against local Worker/D1 fixtures for waiting, live, holiday-empty, error, and unavailable states. Capture status codes and sanitized responses in `docs/qa/pr12/pipeline-health.json`. A public freshness response and a successful cron execution remain separate claims in the evidence.
- [x] Write `docs/operations/pihps.md` with these concrete sections: storage ownership; historical backfill versus daily ingestion; UTC and Asia/Jakarta schedule; day-state definitions; one-date/34-request limits; clean-checkout setup; read-only coverage and job queries; archive location/provenance; explicit-range repair with dry run; safe local/remote command distinctions; deployment trigger verification; and troubleshooting for 503, stale prices, pending/empty days, and missing archives/account access.
- [x] Standardize documented commands to pnpm and the current custom Worker. Include the audit SQL from Task 1 and exact commands exercised during implementation. For every local/remote Wrangler command label its target explicitly; default examples to local and never infer remote readiness from local success.
- [x] Update `DATA_SOURCES.md` to remove stale claims that all current prices are samples or that the daily pipeline is merely proposed. Label historical backfill counts with their original verification date; add newly verified remote counts only after the audit. Link the operations runbook. Label the old design document as historical without rewriting its original decisions as if they had always matched production.
- [x] Run `rtk pnpm exec vitest run src/worker/pihps-health.test.ts src/worker/price-http.test.ts src/worker/index.test.ts src/worker/ingest.test.ts` and `rtk pnpm typecheck`; verify runbook links/commands and commit the health/documentation change.

**Execution evidence:** Health/runbook reviewed through `16ff40d`. 93 targeted tests, typecheck/build, links, audit SQL and indexed query-plan checks passed. `pipeline-health.json` distinguishes controlled-clock Worker dispatcher/SQLite state fixtures from actual Wrangler health. Task 8 also verified actual Wrangler healthy/unavailable HTTP responses and browser behavior, recorded below.

## Task 8: Verify the full application and prepare the replacement PR

**User Story:** As the maintainer reviewing the change, I want repeatable runtime evidence, so that merging the historical fix does not break current production features.

**Files:** Record evidence under `docs/qa/pr12/`; update `DATA_SOURCES.md` with the validated runbook. The rebuilt PR description references #12 and explains the preserved Worker architecture, pagination correction, and coverage evidence.

**Interfaces:** Produces passing required gates, local Worker/D1 request evidence, desktop/mobile screenshots, and a replacement draft PR linked to this thread. It does not imply production data is seeded or deployed.

**Edge Cases:** A pristine dependency install, local Worker errors, empty coverage, unavailable coverage, source gap, pagination across a sparse province, mobile controls, existing citizen/admin behavior, and differences between local and remote history.

**Definition of Done:** Required checks pass; screenshots and requests show the intended behavior; no known regression remains; any unverified production data prerequisite is named explicitly in the PR. Keep the original draft open until its replacement merges.

- [x] Confirm execution preparation used the locked dependencies. Avoid package upgrades.
- [x] Run `rtk pnpm typecheck`, the explicit test targets from Tasks 2 through 7, and `rtk pnpm build`. Inspect the generated-file diff and revert unrelated generator churn.
- [x] Start the built app through the real local Worker with seeded D1: `rtk pnpm exec wrangler dev --port 8787`. Browser verification must use this Worker URL, not only the Vite-only development server.
- [x] Issue HTTP checks for valid snapshot/trend requests, invalid params (400), unsupported methods (405), unavailable historical coverage (503), confirmed empty data (200), and a forced DB error (500 in a local fixture). Walk trend pages with limit 2 to prove no provincial date repeats.
- [x] Invoke the local scheduled handler with controlled clock/source fixtures for Friday, Monday, delayed publication, and a failed run. Prove that target selection, final day state, `job_runs`, health JSON, and invocation outcome agree. Save the results in `docs/qa/pr12/cron-verification.md`; include local trigger timestamps and separately label any verified production events.
- [x] Use T3 preview browser tools for the following desktop and 390px mobile checks. Save screenshots after execution at these paths:
  - `docs/qa/pr12/01-historical-2025-10-30-desktop.png`: real provincial rows and mean matching the archive, historical badge/date/footer aligned.
  - `docs/qa/pr12/02-historical-2018-10-09-mobile.png`: older data readable and controls usable without horizontal overflow.
  - `docs/qa/pr12/03-latest-freshness.png`: newest live date and fresh overlay still work; a pinned historical selection remains pinned.
  - `docs/qa/pr12/04-request-error-retry.png`: failed request shows an error and retry; successful retry restores the requested date.
  - `docs/qa/pr12/05-confirmed-empty.png`: verified empty fixture shows `Tidak ada data`, without a zero national price or fabricated percentage.
  - `docs/qa/pr12/06-trend-sparse-province.png`: day chart has no duplicate points; week/month views keep their current behavior.
  - `docs/qa/pr12/07-citizen-route-smoke.png`: existing public reports and form routes still render through the same Worker.
- [x] Verify A-to-B request races with throttling, direct historical URL reload, and browser back/forward. Verify an absent header date follows latest only on routes that use latest.
- [x] Compare evidence with the requested behavior. If screenshots contradict the intended historical/empty/error behavior, pause and ask whether to correct the mismatch or show the current result; do not claim completion from command success alone.
- [x] Review the final diff for unrelated changes and current AGENTS compliance. Open a replacement draft PR against main, immediately register it with `link_pull_request`, and link #12 as superseded by the replacement in the PR description. Do not close #12 before the replacement lands. Delivered as [draft PR #36](https://github.com/naufaldi/monitor-pangan/pull/36), registered with this thread immediately after creation.
- [x] Prepare a separate production rollout checklist: audit existing D1 coverage and deployed triggers, generate scoped repair SQL only for proven gaps, verify counts and rerun safety locally, then apply the reviewed repair and deployment when authorized. After deployment, read back actual trigger settings and the next available scheduled event/health result. Do not replace an unavailable future cron event with a claim that it passed; record it as pending evidence. Never claim remote readiness based solely on local seeds. Checklist preparation is complete; the production actions within it remain pending.


**Execution evidence:** Local runtime verification is recorded in [runtime-verification.md](../../qa/pr12/runtime-verification.md), [cron-verification.md](../../qa/pr12/cron-verification.md), actual HTTP JSON and seven primary PNGs plus supporting rows/footer/form captures. Sequential typecheck, 26 explicit files / 212 tests, and build passed after final parser fix `7c84b05`; real Wrangler reads and exact history checksums were rechecked. Fixtures and browser instrumentation restored; full/recent checksums and metadata preserved. [Final review](../../qa/pr12/final-review.md) approved the code with no open findings. [Production rollout checklist](../../qa/pr12/production-rollout.md) prepared; actual account quota/tier, fresh remote planning, authorized apply/deployment, trigger readback and future event remain pending. Replacement draft [PR #36](https://github.com/naufaldi/monitor-pangan/pull/36) is open against main and linked to this thread; original #12 stays open until the replacement lands.

## Final plan self-review

- Each meaningful task has a User Story, Edge Cases, Definition of Done, named files, interfaces, and evidence.
- Production coverage is audited first. The user-selected archive supplies local provenance and source comparisons; its unknown location does not justify a production reseed or stop independent code work.
- No step depends on a new TanStack server runtime, fake D1 identifier, PR #14 calculations, or invented official prices.
- The model distinguishes failed/unloaded history from confirmed absence; the URL, request identity, header label, and displayed data refer to the same selection.
- Pagination has one date owner; the province series cannot run ahead of its national page.
- Backend tests include actual local SQL/D1 checks. Browser-visible changes require desktop/mobile screenshot evidence.
- Schedule, day-state transitions, gap selection, failed-run outcomes, health JSON, and the operations runbook all have named verification evidence. There is no new weekly full-history job or monitoring dashboard.
- Execution evidence is recorded per task below and in `docs/qa/pr12/`. Production data and deployment remain unchanged until a reviewed rollout is authorized.
