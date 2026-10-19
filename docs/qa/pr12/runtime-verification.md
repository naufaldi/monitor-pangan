# Local runtime verification, 19 October 2026

Target: the existing custom Worker, `http://localhost:8787`, Wrangler 4.132.0,
Node 24 and locked pnpm dependencies. All application requests and screenshots
used the built assets through Wrangler with **local** D1/R2. No production write,
deployment, new source scrape, report submission or live scheduled fetch ran.
`rtk pnpm install --frozen-lockfile` succeeded without dependency changes.

## Gates

After the final parser boundary fix, sequential `rtk pnpm typecheck`, the 25
previously affected Vitest files plus the new parser file listed below, then
`rtk pnpm build` passed: **212 tests across 26 files**. Route and
data generators produced no tracked diff. Existing Vite chunk-size and router
circular-import warnings remain; the six prerendered routes completed.

```sh
rtk pnpm typecheck
rtk pnpm exec vitest run src/data/price-summary.test.ts src/data/provider.test.ts src/data/provider.effect.test.ts src/data/price-schema.test.ts src/data/api-client.test.ts src/data/price-request.test.ts src/lib/province-fill.test.ts src/lib/civil-date.test.ts src/lib/commodity-search.test.ts src/lib/source-copy.test.ts src/lib/chart-summary.test.ts src/lib/chart-marks.test.ts src/lib/chart-window.test.ts src/lib/daya-beli.test.ts src/worker/price-store.test.ts src/worker/price-http.test.ts src/worker/ingest-plan.test.ts src/worker/ingest-state.test.ts src/worker/ingest.test.ts src/worker/d1-store.test.ts src/worker/index.test.ts src/worker/pihps-health.test.ts src/worker/laporan-store.test.ts scripts/pihps-scrape.test.mjs scripts/price-import.test.mjs src/data/pihps-grid.test.ts
rtk pnpm build
rtk pnpm exec wrangler dev --port 8787
```

## Final source-boundary regression and read recheck

The final review reproduced error envelopes becoming completed-empty days and
zero/negative prices reaching storage. The new regressions first failed in 17
cases. `parsePihpsGrid` now requires a valid `data` array and decodes present,
selected commodity observations as finite positive prices. Empty arrays,
null/blank/dash cells and omitted target-date cells remain legitimate absence.
The shared number-format helper used by the CLI and its rounding are unchanged.

Real SQLite ingestion regressions prove two rejected attempts leave an older
date in `error` with error jobs, and the same date completes only after a valid
empty response. Mixed-scope error envelopes and invalid prices reject a live
refresh before any observation write, retaining the existing price and live
marker while recording an error job. The focused parser, ingestion, store and
CLI checks passed **54 tests across 5 files** before the full affected gate.

The old local Wrangler process had ended; the same command above relaunched
port 8787. Fresh read-only GET checks against the final build are retained in
[`final-fix-http.json`](final-fix-http.json): the two historical snapshots still
return 38 rows, 34 observations and the expected Rp 15,750/Rp 11,700 means;
freshness returns 7,730 positive finite cells through 2026-10-19; health returns
200 `ok`. Every response has `cache-control: no-store`. These checks repeat only
those real reads; the fixture and browser evidence below remains the earlier
capture. No scheduled source request or UI fixture was repeated.

The read-only history verifier passed both before and after these GETs against
`data/repairs/pr12-local-before.json`. Counts and full/recent hashes remain
exactly those listed under Cleanup and boundaries below.

## Actual HTTP evidence

[`runtime-http.json`](runtime-http.json) retains actual local HTTP JSON, separate
from the isolated SQLite dispatcher fixtures in [`pipeline-health.json`](pipeline-health.json).

| Check | Actual result |
| --- | --- |
| Historical snapshot, 2025-10-30 | 200, 38 canonical rows, 34 prices, mean Rp 15,750 |
| Historical snapshot, 2018-10-09 | 200, 38 canonical rows, 34 prices, mean Rp 11,700 |
| Impossible date and nonnumeric trend limit | 400 |
| POST snapshot | 405 |
| Unobserved/unconfirmed 2017-03-28 | 503 `coverage_unavailable` |
| Freshness | 200, latest 2026-10-19, 7,730 overlay cells |
| Health after D1 compatibility fix | 200 `ok`, checked/priced date 2026-10-19 |
| Citizen metadata / unauthenticated admin queue | 200 / 401 |
| Synthetic completed-empty survey | 200, null national mean, zero priced provinces |
| Synthetic broken price view | snapshot 500; fresh 503; health 503 `unavailable` |

All price/health evidence responses have `cache-control: no-store`. Actual `/`
and `/admin` returned HTML 200/no-store with freshness injection; admin additionally
returned `x-robots-tag: noindex, nofollow` and matching robots HTML. CSS/JS assets
loaded through the same Worker. Local form metadata has no Turnstile site key,
so report submission stays disabled; submission was outside this smoke check.

Trend pages for beras, province 92, 2026-09-16..2026-10-19, `limit=2` traversed
24 national and 22 provincial points. Both date sets are unique and every selected
point belongs to the national page. This is actual sparse production-derived
local data, not a fabricated province series.

The forced DB fixture renamed the local price table and created a view referencing
a deliberately missing table. A `finally` cleanup dropped the view and restored
the table. The empty fixture backed up every row/marker for 2025-10-29, deleted
that day's observations and inserted a synthetic `empty` marker; `finally`
restored the original rows and removed the marker. It is UI state evidence only,
not evidence that the archive confirmed an empty survey on that date.

## Runtime defect found and fixed

The initial real health request returned 503 `unavailable`. A temporary local
error diagnostic showed `D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR`.
A five-term read-only UNION query succeeded in Wrangler D1; a six-term query
failed. The existing ten-commodity UNION query exceeded that runtime bound,
although the Node SQLite adapter accepted it.

`f47de1b` keeps separate sequential backwards index seeks per commodity. This
preserves bounded reads and stays below D1 connection limits. A transport-boundary
regression first failed (503 versus expected 200), then passed after the fix;
actual Wrangler health also changed to 200 `ok`. The temporary diagnostic was
removed. This is why local SQL unit tests and real runtime checks complement
each other: the database engine family alone does not define deployment limits.

## Browser evidence

A new, agent-owned T3 native preview tab was used throughout, explicitly targeting
port 8787. The primary desktop viewport was 1280px wide; mobile was 390 × 844 CSS
pixels. Each PNG was copied from the native saved screenshot and visually inspected.

| Capture | Observed behavior |
| --- | --- |
| [01 desktop history](01-historical-2025-10-30-desktop.png) and [01b rows/footer](01b-historical-rows-footer-desktop.png) | Correct date/badge, Rp 15,750 mean, actual province rows and historical footer |
| [02 mobile history](02-historical-2018-10-09-mobile.png) and [02b rows/footer](02b-historical-rows-footer-mobile.png) | Rp 11,700, readable older observations and controls; document width equals viewport width, 390px |
| [03 latest](03-latest-freshness.png) | Absent `tanggal` follows live 2026-10-19; overlay present and mean Rp 16,400 |
| [04 error/retry](04-request-error-retry.png) | Synthetic request 503 shows coverage error and `Coba lagi`, retaining requested 2025-10-29 |
| [05 empty](05-confirmed-empty.png) | Synthetic local fixture shows `Tidak ada data`; no table, zero price, or fabricated percentage |
| [06 sparse province](06-trend-sparse-province.png) | Papua Barat day chart preserves gaps on October 14/19, unique table dates |
| [07 citizen list](07-citizen-route-smoke.png) and [07b form](07b-citizen-form-smoke.png) | Public reports and form render, without official PIHPS badge |

A-to-B race methodology: only this local tab's `window.fetch` delayed the real
2025-10-27 response by 1.2 seconds, ignoring cancellation so it really arrived
after the 2025-10-28 response. The recorded order was A-start, B-start, B-resolve,
A-resolve. Final URL, date input, badge, footer and province prices all remained
on B. Original fetch was restored. Back returned to October 27 and forward to
October 28 with aligned data and footer. Direct historical URL reloads for both
regression dates remained pinned after live overlay mount.

Retry methodology: tab-local fetch returned one synthetic coverage 503 for
2025-10-29. After restoring real fetch, clicking `Coba lagi` rendered that date's
real table. No API debug route or source code instrumentation remains.

At 390px, previous/next controls moved October 9 → 10 → 9; province search for
Aceh returned its actual Rp 10,300 row, and selecting it retained the historical
date. No horizontal document overflow occurred. Existing long navbar labels
wrap awkwardly at 390px; this predates this change and controls remain usable.
Week (`1 tahun`, 73 rows) and month (`Semua`, 115 rows) trend views still render;
`1 bulan` day view rendered 30 unique national dates with the two observed
provincial gaps. `/tren` follows latest; citizen routes omit a date badge.

## Cleanup and boundaries

After fixtures, the read-only `verify-history.mjs` check matched the pre-fixture
baseline exactly: 799,466 cells, 2,473 dates, 23 source days, 55 jobs. Full SHA-256:
`b631938aca4c5cfe514b73f29b512bef9a7270504c343e51e9f9e855f12c3274`.
Recent 8,040-cell SHA-256:
`dfe4dc08f27bf4cff81d98d444acf4a8ac9a042fba03b4942443e98a6c26cdee`.
Both 38-cell archive fixtures still match. All exported source-day fields and
job fields match the original metadata export (job IDs were not part of that
export). Browser fetch instrumentation was
restored and navigation reloaded a clean page. Source/archive history was not
modified. No temporary fixture table/view remains.

Controlled scheduler evidence is [documented separately](cron-verification.md).
The [production rollout checklist](production-rollout.md) remains pending;
local restored data does not imply remote history has been repaired, triggers
have deployed, or the next real scheduled event has run. Independent branch
review and replacement draft PR publication are separate finishing gates.
