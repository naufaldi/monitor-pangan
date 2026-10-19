# Issue #38 verification

Verified locally on 19 October 2026 on `feat/38-pihps-daily-archive-sync`.
No production deployment, remote import, source HTTP request, workflow activation,
secret installation or live GitHub archive PR was performed.

## Data flow exercised

`prepare-local.mjs` invokes the real `handleScheduled` program with controlled
PIHPS grid responses and the real D1 SQL adapter backed by a dedicated SQLite
file under ignored `data/repairs/issue-38/`. The first invocation records a pending
same-day check with zero observations. The second writes 34 provincial beras
observations and one immutable outbox event. Export then updates a copied
repository archive; a repeated export is unchanged and makes no source request.
The captured [flow evidence](flow.json) records 68 controlled source-scope calls,
two successful jobs, one event, zero remaining export events and unchanged replay.
These are test invocations, not real Cron Trigger executions.

The exported archive was folded with the base to generate local-only restore
SQL for the two historical fixtures and the new date: 714 observations total,
zero updates and zero source-day changes. This SQL was applied twice to the
actual local Wrangler D1 database. The restore generator was also invoked
against the update-only range `2026-10-19..2026-10-19`: 34 inserts, zero updates,
zero coverage changes. SQL and local databases stay ignored.

The built custom Worker ran at `http://localhost:8798`, with its local D1 and
R2 bindings. Port 8787 was already in use and was not stopped or modified.
[HTTP evidence](http-verification.json) verifies:

- Both 38-province fixture grids match every expected price/null; each has 34
  observed provinces. National prices retain Rp 50 rounding: Rp 11,700 on
  2018-10-09 and Rp 15,750 on 2025-10-30.
- The new restored date 2026-10-19 has 34 prices and national Rp 16,000.
- The freshness API reports that date and exactly 34 new observations.
- The sparse national/province trend API returns all three dates and the exact
  expected national/Jakarta values, with no next cursor.
- Repeating the local apply leaves these prices unchanged. Automated restoration
  tests additionally check zero effective writes and preservation of newer rows,
  source-day/job metadata and official conflicts.

## Browser user flow and screenshots

The flow used the actual local Worker rather than Vite's frontend-only server:
open an old date, select the 2025 fixture from the date picker, choose **Terbaru**,
search **Jakarta**, select its table row, then open **Grafik**. Both desktop and
390 px mobile layouts were exercised. Mobile page width equals viewport width;
no horizontal page overflow was observed. The graph shows the restored latest
price alongside the application's existing historical series.

The shared T3 browser performed the initial flow. Its final screenshot refresh
failed twice with `Preview automation snapshot timed out after 15000ms.` The
same flow was repeated in an isolated `agent-browser` session to save the clean
PNG evidence below. That browser session was closed afterward.

- [2018 history, desktop](01-history-2018-desktop.png)
- [2025 history, desktop](02-history-2025-desktop.png)
- [New restored date, desktop](03-latest-restored-desktop.png)
- [Jakarta search and selection, mobile](04-jakarta-mobile.png)
- [Graph with restored latest price, mobile](05-trend-mobile.png)

## Automated gates

Passed `rtk pnpm typecheck` and `rtk pnpm build`. The build retained the existing
circular-dependency warning and large-chunk advisory; no frontend code changed.

The following explicitly targeted files passed: 114 tests across 14 files:

```sh
rtk pnpm exec vitest run --maxWorkers=1 src/worker/archive-outbox.test.ts src/worker/d1-store.test.ts src/worker/ingest-state.test.ts src/worker/ingest.test.ts src/worker/index.test.ts src/worker/pihps-health.test.ts src/worker/price-http.test.ts scripts/pihps-history.test.mjs scripts/pihps-history-updates.test.mjs scripts/pihps-history-sync.test.mjs scripts/pihps-history-publish.test.mjs scripts/pihps-history-status.test.mjs scripts/pihps-history-github-evidence.test.mjs scripts/price-import.test.mjs
```

Full-history restoration passed separately: two tests, including all 791,426
observations, both historical fixtures, official conflicts and zero-write replay:

```sh
rtk pnpm exec vitest run --maxWorkers=1 scripts/pihps-history-restore.test.mjs
```

The original flat-directory digest helper was updated to include nested update
files. Running the large restore alongside other heavy workers exhausted its
60-second test budget; isolated restoration completed in 36 seconds. The CI
validation workflow uses one test worker. A build attempted during the earlier
high-load run failed while connecting to its temporary local prerender server;
the subsequent build completed all six prerendered routes.

`history:pihps:validate` and `history:pihps:rebuild` passed. Root year files and
the audited base manifest remain unchanged; repeated rebuild is byte-identical
including nested update files. `actionlint` v1.7.12, downloaded from its official
release with SHA-256 verification, accepted both workflows.

Read-only runtime checks can be reproduced while the local Worker is running:

```sh
rtk proxy node docs/qa/issue-38/verify-local.mjs
```

Preparing the controlled flow requires a fresh ignored fixture directory; the
script refuses to overwrite its database:

```sh
rtk proxy node docs/qa/issue-38/prepare-local.mjs
rtk pnpm exec wrangler d1 execute monitor-pangan --local --file data/repairs/issue-38/restore.local.sql --json
rtk pnpm exec wrangler dev --local --port 8798 --inspector-port 9248
```

## Independent review

Two read-only subagents reviewed archive correctness and automation separately.
Four distinct P2 findings were reproduced with failing tests and fixed:

1. A previous merged PR no longer causes a retry to discard an orphaned pending
   branch after push succeeds and new PR creation fails. A real Git remote test
   preserves the same remote SHA and checkpoint with a smaller retry limit.
2. An epoch reset between head/page reads now aborts before publication; events
   cannot be silently labeled with the previous database identity.
3. GitHub metadata failure no longer prevents independent D1 backlog/lag checks
   or discards already readable archive checkpoints and export success.
4. A successful export followed by failed artifact upload remains the last
   successful export after a later failed run. Evidence is based on actual
   exporter steps across bounded completed workflows, not workflow conclusions.

The reviewers' focused follow-up checks passed, with no remaining P1/P2 findings.
Publisher verification additionally exercises a competing remote branch update:
the stale push fails its lease and the next run resumes safely.

### Additional GPT-6.1 Sol review

A third read-only review used `gpt-6.1-sol` with high reasoning effort on
`13df19b..a892b0b`. It found two additional P2 defects, both reproduced with
failing tests and fixed:

- Unreadable GitHub archive checkpoints no longer become zero. Each unknown
  checkpoint and its dependent counts/lag stays null, while independently
  readable checkpoints, D1 head and success evidence remain visible.
- The publisher refreshes PR state after pushing. A PR merged during export
  causes the next open PR to be created; a PR closed without merging blocks
  publication. Replacement PR creation must confirm an open PR owned by the bot.
  The real Git regression now covers actual squash merges and concurrent merge
  and closure during export.

The reviewer checked both fixes and reported no remaining actionable P1/P2
findings. Its independent follow-up passed eight status/evidence tests. The
parent's regression run passed 23 tests across six explicit files:

```sh
rtk pnpm exec vitest run --maxWorkers=1 scripts/pihps-history-updates.test.mjs scripts/pihps-history-sync.test.mjs scripts/pihps-history-publish.test.mjs scripts/pihps-history-status.test.mjs scripts/pihps-history-github-evidence.test.mjs src/worker/archive-outbox.test.ts
```

`rtk pnpm typecheck` and `rtk pnpm build` also passed. The existing local browser evidence remains
applicable: this follow-up changes only archive status and publication tooling.

## Production evidence still pending

The workflow is disabled until `PIHPS_ARCHIVE_SYNC_ENABLED=true` is explicitly
configured. The Worker deployment, bounded predeployment-data reconciliation,
GitHub App/environment secrets, account quota checks, real archive PR, deployed
trigger readback and next real scheduled event are unverified. Follow the
[archive runbook](../../operations/pihps-archive-sync.md) and existing production
rollout checklist before making any of those claims.
