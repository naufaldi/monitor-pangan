# PIHPS daily repository archive synchronization implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a draft for review, not authorization to deploy or enable production automation.

**Goal:** Keep reviewed repository history current with validated PIHPS observations in D1, including corrections, without repeating successful source ingestion.

**Architecture:** The existing Worker remains the only scheduled PIHPS fetcher. Its successful price publication transaction also records a durable, immutable D1 export event. A separate GitHub Actions publisher reads those events, validates deterministic yearly update files, and maintains one archive PR. The original audited archive stays intact; restoration folds validated updates over it.

**Tech Stack:** Existing Effect 3, Effect Schema, TypeScript, Node 24 scripts, Cloudflare Worker/D1, pnpm, GitHub Actions and GitHub CLI/API. No new runtime dependency or source scraper.

## Evidence and scope

- [Issue #38](https://github.com/naufaldi/monitor-pangan/issues/38) is open; [#37](https://github.com/naufaldi/monitor-pangan/issues/37) is closed and implemented by merged PR #39. Checkout inspected: `988c90e`.
- `src/worker/ingest.ts` already fetches one selected survey date, 34 provinces, concurrency five, parses responses, and records ingestion outcomes. `src/worker/ingest-plan.ts` prioritizes unresolved weekdays and can refresh today. It does not revisit arbitrary completed historical dates.
- `src/worker/d1-store.ts` commits insert-only chunks first, then atomically refreshes prices and publishes the source-day marker. Failed refreshes preserve old values and confirmed new cells. Retain this behavior.
- `scripts/pihps-history.mjs` and `pihps-history-files.mjs` deliberately validate the exact #37 audit: 791,426 observations, 2017-03-27 through 2026-09-15. `seed-d1.mjs` also enforces that range and uses year-wide derived provenance. Simply appending dates would break validation and misattribute observations.
- There is no `.github/` workflow in this checkout. `wrangler.toml` declares `15 7 * * MON-FRI` and `15 10 * * MON-FRI`, or 14:15 and 17:15 WIB. Actual corrected deployment/event verification remains pending in `docs/operations/pihps.md`.
- D1 serves the application. This work changes storage publication and operations, with no frontend component, route, national rounding, citizen-data, or full-history source-fetch change.

## Global constraints

- Use pnpm from the repository root and Node 24. Follow Effect conventions in `AGENTS.md`, `.agents/skills/effect-ts/SKILL.md`, nearby source and installed Effect guidance before implementation.
- External database, file, API, environment and command-line inputs require Schema parsing. Use typed errors, Effect programs and `@effect/vitest` with `assert`.
- Do not edit generated `src/data/*.gen.ts` or `src/routeTree.gen.ts`.
- Preserve the #37 base year files and base manifest byte-for-byte. Keep their nulls, 23 unknown weekdays, audited counts and immutable derived provenance.
- Missing values, retained observations, successful ingestion, verified source completion, export publication and merge into `main` are distinct facts.
- Never delete a good price because an export, source request, decode, staging operation, or Git operation failed. No synthetic zero prices or empty-day markers.
- Archive updates contain official PIHPS provincial retail observations only. No raw HTTP bodies, generated SQL, databases, credentials, citizen data or national series.
- No deployment, production import, secret configuration, workflow activation or source HTTP calls during plan preparation. Implementation can prepare and locally verify the complete change before rollout authorization.

## Design decision

Use a transactional export outbox, which is a table of changes waiting for a separate publisher. A change is recorded at the same commit boundary as the prices it describes. Archive failures therefore do not turn successful source ingestion into failure.

Two alternatives were considered:

1. A date-only cursor is smaller, but misses corrections to dates already archived.
2. Comparing all production observations on every GitHub run avoids an outbox, but repeatedly scans history and makes bounded retries and concurrent snapshots harder to prove.

The outbox adds a small D1 write per changed day and explicit bootstrap work. In return, export reads are indexed and bounded, corrections have a durable sequence, and Git retries need no PIHPS requests. Use a GitHub Actions export schedule, not another ingestion scheduler. Direct Worker-to-GitHub dispatch would put repository credentials in another runtime and couple source success to GitHub availability.

## State, boundaries and ownership

- The ingestion program owns fetch/decode/job outcomes. `PriceStore.upsertDay` owns price publication and outbox capture. The publisher never fetches PIHPS or changes source/job metadata.
- An export event is immutable and ordered by `(epoch, sequence)`, not survey date or wall-clock timestamp. The epoch is stored once in D1 and changes after a reset/reinitialization; an epoch mismatch requires explicit reconciliation.
- Publication states are `not_initialized`, `caught_up`, `awaiting_review`, `behind`, `error`, and `unavailable`. Error/unavailable outcomes retain last known publication and merge evidence. Do not represent a missing database or credential as zero lag.
- Parse D1 events before writing files; parse the entire staged archive before publishing; validate command arguments and GitHub responses before mutating a branch.
- A PR head is published evidence; only verified archive contents on `main` are merged evidence. Neither modifies `/api/pihps/health` ingestion semantics.

## File map

- Create `src/worker/archive-outbox.ts`: table DDL as complete statements, event schemas and transactional capture statements.
- Modify `db/schema.sql` and `src/worker/d1-store.ts`: schema parity and append capture to the existing final publication batch.
- Create `src/worker/archive-outbox.test.ts`; extend ingestion/state/migration tests.
- Create `scripts/pihps-history-updates.mjs`: update schemas, canonical serialization, validation and folding.
- Modify `scripts/pihps-history.mjs`, `scripts/pihps-history-files.mjs`, `scripts/history-pihps.mjs`, `scripts/seed-d1.mjs`: integrate updates without weakening base validation or restore conflicts.
- Create `scripts/pihps-history-sync.mjs`: bounded outbox reader, local staging and synchronization command.
- Create `scripts/pihps-history-publish.mjs`: Git branch/PR reconciliation and sanitized operational receipts.
- Create corresponding `*.test.mjs` files; extend `scripts/pihps-history-restore.test.mjs`.
- Add `data/history/pihps/updates/manifest.json` and yearly `updates/YYYY.jsonl` when events exist. Extend the archive filename allowlist narrowly for this directory.
- Create `.github/workflows/pihps-history-sync.yml` and `.github/workflows/pihps-history-validate.yml`.
- Modify `package.json`, `DATA_SOURCES.md`, `data/history/pihps/README.md`, `docs/operations/pihps.md`; add `docs/qa/issue-38/verification.md` after checks actually run.

## Task 1: Record changed observations at the D1 publication boundary

**User Story:** As a maintainer, I want successful price changes recorded durably so archive publication can retry independently.

**Interfaces:** Keep `PriceStore.upsertDay(date, status, rows, checkedAt)` unchanged. Add `archiveOutboxStatements` to schema initialization and `capturePublishedDay(db, date, checkedAt)` returning prepared statements for the existing final batch, not a separate post-commit effect. Export an `ArchiveEventSchema` for both Worker tests and Node consumers.

- [ ] Add tables `pihps_archive_epoch` (singleton immutable identifier) and `pihps_archive_events` (`seq INTEGER PRIMARY KEY AUTOINCREMENT`, date, kind, captured_at, source_check_json, observations_json). Add an index on `(date, seq DESC)`. Use `kind = daily_ingest | d1_reconciliation`; every event contains nonempty validated observations and an immutable snapshot, not a reference to mutable current prices.
- [ ] Canonicalize each day's current official retail observations by `(commodity_id, region_code)`. Capture retained good cells as D1 observations, not as newly fetched HTTP evidence. Preserve safe existing observation references and record the event's source-check evidence separately.
- [ ] Within the final live publication batch, update fetched rows' `raw_ref` to a deterministic PIHPS grid request reference. Do not leave an overwritten historical value labeled with its old derived Git reference. Do not copy raw responses or secrets into references.
- [ ] After the price upsert and marker, append an event using `INSERT ... SELECT` only when canonical observation values/references differ from the latest event for that date. Exclude attempt timestamps from this equality comparison. Perform comparison and snapshot construction in SQL in the same batch so concurrent writers cannot create stale payloads. Repeating unchanged ingestion must create no event.
- [ ] Keep the insert-only partial-write phase unchanged. Failed source/decode attempts and failed final publication transactions produce no new export event. Valid partial cells remain in D1 and become exportable after successful final publication or an explicit reconciliation. An outbox failure rolls back the final price refresh/marker transaction; the confirmed insert-only chunks remain retryable as today.
- [ ] Add DDL to both schema entrypoints. Supply complete statements to `db.batch`; do not introduce SQL triggers that would break the current semicolon splitter. Initialization must be idempotent and perform no automatic historical scan or seed.
- [ ] Implement tests for unchanged repeat, older-date correction, concurrent publication, rollback on event insert failure, pending/empty/error, retained cells, and stale `raw_ref` replacement. Recheck cold-start query count and transaction sizes for a 340-cell day.

**Edge Cases:** No rows; successful empty survey; existing live marker with a failed refresh; 40 confirmed inserts before storage failure; older date corrected after a newer event; same-day rerun with a later timestamp; epoch reset.

**Definition of Done:** A successful changed day commits prices, completion evidence and one matching event together. A repeat emits none. Injected failure preserves existing history and leaves no misleading event. Existing ingestion/job tests still pass.

```sh
rtk pnpm exec vitest run src/worker/archive-outbox.test.ts src/worker/ingest-state.test.ts src/worker/d1-store.test.ts src/worker/ingest.test.ts src/worker/index.test.ts
```

## Task 2: Add a deterministic update archive and preserve clean restoration

**User Story:** As a developer, I want a clean checkout to restore new and corrected observations with accurate provenance while retaining the audited recovery base.

**Interfaces:** `readHistory(directory)` continues validating the immutable base and additionally returns validated `updates`. `historyObservations(archive)` folds base and ordered events into unique effective observation keys with the winning observation's provenance. `updateArchiveFiles(events, epoch)` returns canonical yearly JSONL files and an update manifest. Export the pure helper `foldObservationUpdates(baseRows, events)` from `scripts/pihps-history-updates.mjs`; it returns rows sorted by `(date, commodity_id, region_code, level)`, using the latest event sequence per key and retaining untouched base rows.

- [ ] Define each JSONL record as a versioned event: `schemaVersion`, `epoch`, `sequence`, `kind`, `date`, `capturedAt`, `sourceCheck`, and sorted observation tuples `[commodityId, regionCode, price, sourceRef]`. Partition by survey year, serialize records in increasing sequence order, and require globally unique sequences across files. D1 sequences order corrections even when survey dates go backward.
- [ ] Define `updates/manifest.json` with schema version, epoch, exported-through sequence, per-file hashes/bytes/event and observation counts, date ranges, and an exact reference to the validated base manifest hash. An empty update manifest has null epoch, zero events and zero sequence. No exporter wall-clock timestamp or CI run identifier belongs in committed output.
- [ ] Reject unknown fields, invalid civil dates, nonprovincial IDs, nonretail/source lanes, nonpositive/nonfinite/noninteger prices, duplicate event/observation keys, unordered tuples, conflicting duplicate sequences, unsafe references, path traversal, and manifest/hash/count disagreement. Treat partial trailing JSONL as corruption.
- [ ] Extend the root allowlist only for a validated regular `updates` directory with approved filenames; reject symlinks and unrelated files. Generalize staged directory publication to this exact nested structure while retaining lock, validate-before-install and rollback behavior.
- [ ] Fold update events over the base by sequence and observation key. Sparse events only replace keys they contain; missing cells do not erase earlier values. A higher-sequence D1 correction overrides a base value in the archive view, while the original base bytes retain their original attribution.
- [ ] Adjust `seed-d1.mjs` bounds to the validated effective archive range. Preserve its existing rule that official rows already in the target database win; non-PIHPS primary-key collisions still fail. Restore per-observation references; do not apply the base year's Git reference to update cells. No source-day, job or citizen writes are generated, including for events with source-check metadata.
- [ ] Add tests below and preserve existing base audit/tamper tests. Rebuild twice and compare every byte recursively. Confirm both unchanged historical fixtures and a corrected fixture can be exercised separately.

The core folding test should demonstrate both correction ordering and preservation:

```js
import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { foldObservationUpdates } from './pihps-history-updates.mjs'

it.effect('a later sequence corrects an older date without erasing another province', () => Effect.gen(function* () {
  const base = [
    { date: '2018-10-09', commodity_id: 'beras', region_code: '31', price: 13200 },
    { date: '2018-10-09', commodity_id: 'beras', region_code: '32', price: 12000 },
  ]
  const event = {
    sequence: 9, date: '2018-10-09',
    observations: [['beras', '31', 14000, 'd1:pihps:epoch-test:9']],
  }
  const rows = foldObservationUpdates(base, [event])
  assert.deepStrictEqual(rows.map((row) => row.price), [14000, 12000])
  assert.strictEqual(rows[0].raw_ref, 'd1:pihps:epoch-test:9')
}))
```

**Edge Cases:** New year (2027); correction in 2018 after a 2026 event; update null/omission; corrupt nested file; version-1-only checkout; different epochs; identical sequence replay; target D1 already contains a newer official value.

**Definition of Done:** Base bytes and audit stay unchanged; new/corrected observations restore from tracked files with correct provenance; rebuild/replay produces zero diff/writes; both original 38-province fixtures and Rp 50 rounding remain valid on the unmodified historical fixture dataset.

```sh
rtk pnpm exec vitest run scripts/pihps-history.test.mjs scripts/pihps-history-updates.test.mjs scripts/pihps-history-restore.test.mjs scripts/price-import.test.mjs
rtk pnpm history:pihps:validate
rtk pnpm history:pihps:rebuild
rtk git diff --exit-code -- data/history/pihps
```

Run the last comparison after staging the intended initial empty update manifest, so it measures rebuild determinism rather than the deliberate format extension.

## Task 3: Export bounded, stable D1 event batches and reconcile existing data

**User Story:** As an operator, I want to export a bounded set of committed changes without source requests, mutable-read races, or missing predeployment observations.

**Interfaces:** `readArchiveEvents({ after, through, limit })` returns parsed immutable events and a next sequence. The CLI supports `sync`, `reconcile`, and `status` subcommands. `sync --target local --existing-db <path>` reads an explicit SQLite fixture; `sync --target remote` uses the Cloudflare D1 query API with a D1 Read token. Remote sync performs SELECTs only.

- [ ] Add fixed, parameterized queries for epoch, upper sequence, indexed event pages and latest observation-change time. At run start freeze `through` to the current maximum event sequence, then read `after < seq <= through ORDER BY seq LIMIT ?`. New events above the watermark wait for the next run. Export stored event bodies rather than re-reading mutable prices per page.
- [ ] Default to 25 events/page, at most 100 events and 20 MiB decoded payload per run, with a per-request timeout of 30 seconds and maximum two transport retries. Enforce bounds before staging. Reduce the effective watermark to the last fully processed event when capped; never skip an unread event. Report `remainingEvents` and a bounded retry instruction.
- [ ] Add named commands `history:pihps:sync`, `history:pihps:reconcile`, and `history:pihps:status`. Local sync stages files and reports a diff without Git/network mutation. Remote sync is explicit and never calls the source scraper or deploy command. Redact API bodies/errors; allowlist known account/database configuration and API origin.
- [ ] Bootstrap existing D1 observations once through explicit reconciliation. Provide an initially dry-run, date-bounded command that builds canonical day snapshots using `INSERT ... SELECT` from current official D1 rows and the same compare-with-latest-event guard. Record `kind=d1_reconciliation`, original HTTP evidence false, source completion unknown. This is a separate authorized D1 mutation, never a side effect of ordinary sync or Worker cold start.
- [ ] Select bootstrap ranges from a fresh D1 audit, including existing dates after September 15 and differences inside the audited range. A D1 row equal to the base can be documented as reconciled D1 evidence without rewriting the original base. D1 gaps must never remove base observations. Reconcile a bounded range at a time after measuring actual row/write quota.
- [ ] Document the writer contract: daily ingestion and subsequent supported repair/correction paths must capture an event transactionally. Direct SQL that bypasses that path requires explicit reconciliation. This feature exports corrections already stored in D1; it does not discover PIHPS corrections on historical dates the existing scheduler never revisits.
- [ ] Test page boundaries, a write during export, transport/API errors, invalid JSON, bounds exhaustion, interrupted staging, epoch mismatch, bootstrap concurrency with daily publication and duplicate bootstrap. Use controlled fixtures and API stubs, never real PIHPS requests.

**Edge Cases:** No events; missing tables before deployment; 429/5xx; unauthorized API; event body exceeds cap; D1 reset; recent data exists before migration; a correction occurs while a page is exporting.

**Definition of Done:** Export covers exactly the advertised sequence interval and can resume after failure. Bootstrap is explicit/idempotent, records only current official observations, and never invents source completion. Local export writes no D1 data.

```sh
rtk pnpm exec vitest run scripts/pihps-history-sync.test.mjs src/worker/archive-outbox.test.ts
```

Example commands to implement and document:

```sh
rtk pnpm history:pihps:sync --target local --existing-db /absolute/path/to/fixture.sqlite --max-events 100 --dry-run
rtk pnpm history:pihps:reconcile --target local --existing-db /absolute/path/to/fixture.sqlite --from 2026-09-16 --to 2026-10-19 --dry-run
```

## Task 4: Publish one reviewable PR with retry and concurrency protection

**User Story:** As a reviewer, I want one focused archive PR, with no duplicate commits or PRs when unchanged work is retried.

**Interfaces:** `publishArchiveUpdate` consumes a validated staged archive, captured base/head SHAs and a sync result. It returns `unchanged | published | conflict | error`, with branch/PR identifiers only after GitHub confirms them. The owned branch is `automation/pihps-history`; its PR targets `main`.

- [ ] Add a trusted workflow on `main`: `workflow_dispatch` plus proposed export crons `45 7 * * MON-FRI` and `45 10 * * MON-FRI` (14:45/17:45 WIB). These poll the D1 outbox only; retain the Worker's existing ingestion schedule. GitHub scheduling may be delayed; a later/manual export processes the same durable backlog.
- [ ] Use one concurrency group `pihps-history-sync` with `cancel-in-progress: false`, a 15-minute timeout and the same bounds for manual/automatic runs. On manual runs require `github.ref == refs/heads/main`. Load executable code only from trusted `main`, even when reading data from the bot branch.
- [ ] Keep a D1 Read API token in a GitHub environment secret. Prefer a repository-scoped GitHub App installation token with Contents and Pull requests write for publication, so automated PR checks run normally. Do not give either token to the Worker, browser, fork PR jobs, command output, committed files or artifacts. Pin Actions to reviewed immutable SHAs at implementation time; checkout uses `persist-credentials: false`.
- [ ] Fetch `main` and the owned branch. Confirm branch/PR ownership and an archive-only allowlist before using branch data. Refuse unexpected edits. Validate existing pending update files before extending their sequence. Reconcile a stale branch from current `main` plus the validated pending event union; preserve every event already proposed.
- [ ] Stage only `data/history/pihps/updates/`. Verify the base archive is unchanged, run archive validation and deterministic rebuild, then compare bytes against the existing publication head. Zero diff produces no commit, push or new PR. A changed archive gets one focused commit and creates/updates the single existing PR.
- [ ] Protect branch replacement with an explicit expected remote SHA (`--force-with-lease` only for the owned bot branch when rebuilding its base). A mismatched SHA aborts and retries from fresh state. Never force `main`, bypass branch protection or auto-merge. A push succeeding before PR creation fails must be recoverable by finding that branch and creating its missing PR next run.
- [ ] PR body lists sequence interval, new/corrected survey dates, counts, provenance limits, validation and remaining backlog. Changed years only appear in the diff. The ordinary unchanged run neither appends timestamps nor edits the PR unnecessarily.
- [ ] Add a separate secret-free `pull_request` validation workflow for archive/implementation changes: archive validation, typecheck, explicitly targeted tests and build. Do not use `pull_request_target` to execute PR code with secrets.
- [ ] Test unchanged replay, preexisting PR, merged/deleted branch, closed unmerged PR, push-success/PR-failure, base branch advance, unexpected branch edits, failed validation and a compare-and-swap conflict. A manually closed unmerged PR is treated as a publication block and reported; do not silently recreate a rejected proposal.

**Edge Cases:** Overlap despite local writers; token expiration; GitHub outage; pending PR open for several days; someone edits the bot branch; branch deleted after merge; a PR is closed without merging.

**Definition of Done:** A controlled changed dataset publishes exactly one PR; identical replay adds no commit/PR; overlapping publishers cannot regress the branch. Failure leaves D1 and the last valid archive untouched. Secret-free checks validate the actual proposed archive.

```sh
rtk pnpm exec vitest run scripts/pihps-history-publish.test.mjs scripts/pihps-history-sync.test.mjs
```

## Task 5: Report archive health independently and prove the complete retry path

**User Story:** As an operator, I want to distinguish a fetch problem, export problem and pending review so I retry the correct operation.

**Interfaces:** `history:pihps:status` outputs sanitized JSON combining D1 outbox metadata, archive manifests from `main`/the owned PR, and GitHub workflow receipts. No new public Worker export endpoint is required.

- [ ] Report `epoch`, `latestD1Sequence`, `publishedSequence`, `mergedSequence`, `unpublishedEventCount`, `unmergedEventCount`, `oldestUnpublishedCapturedAt`, `archiveLagSeconds`, `lastSuccessfulExportAt`, `lastSuccessfulMergeAt`, `lastAttemptOutcome`, sanitized error category, and PR URL. Uninitialized/unavailable evidence stays nullable; clock-based lag uses Effect Clock. Counts use sequence membership, not differences between integers that may have gaps.
- [ ] Keep `archiveLagSeconds` defined as age of the oldest captured event absent from `main`, or zero when merged and caught up. Report export lag separately from merge lag. This makes an old-date correction visible even when the newest survey date is unchanged.
- [ ] Write operational receipts to workflow summaries and small sanitized artifacts, not archive files. Record each run's outcome (`unchanged`, `published`, `bounded`, `error`), time, sequence range, archive hash, PR/head and error category. An error receipt retains the previous success reference. Use GitHub workflow history plus `main`/PR manifests for recovery; artifacts are evidence, never the sole cursor.
- [ ] Derive merged progress from the validated manifest on `main`, including squash merges. A published PR does not advance merged progress. Preserve the last successful export even when the latest run fails; missing/expired evidence reports unknown timestamps, not invented successes.
- [ ] Add a local integration test that drives the existing `handleScheduled` with controlled PIHPS fixtures and real SQLite-backed D1 SQL, then exports and stages the result. Inject export failure and retry export alone: assert the source mock invocation count stays unchanged, D1 prices/jobs stay intact, and the final archive equals the uninterrupted run.
- [ ] Cover delayed same-day zero observations followed by the later successful trigger, malformed/error source data, older-day correction, unchanged repeat and overlapping publication. Verify the journal does not falsely complete an empty day and `/api/pihps/health` retains its ingestion-only behavior.
- [ ] Record actual results in `docs/qa/issue-38/verification.md`, with fixture target, commands, archive hashes, event/PR counts, failure injection outcomes, and production checks explicitly pending. This is backend/automation work; browser screenshots are not an acceptance requirement.

**Edge Cases:** Fresh ingestion but export error; exported PR awaiting review; no production history imported; sequence gaps; a newer source date hides an older correction; stale or expired workflow artifact; GitHub unavailable during status.

**Definition of Done:** Operators can see independent ingestion/export/merge outcomes and retry export without source HTTP. Controlled end-to-end tests prove the success and failure paths using the production SQL and existing scheduler function.

```sh
rtk pnpm exec vitest run scripts/pihps-history-sync.test.mjs scripts/pihps-history-publish.test.mjs src/worker/archive-outbox.test.ts src/worker/ingest-state.test.ts src/worker/pihps-health.test.ts
```

## Task 6: Complete the runbook, verification gates and staged rollout

**User Story:** As the repository owner, I want documented ownership, bounded recovery and evidence of real scheduled operation before calling automation verified.

- [ ] Update `DATA_SOURCES.md`, the archive README and `docs/operations/pihps.md` with Worker/outbox/Actions/reviewer ownership, base-versus-update provenance, schedules and timezone conversion, bootstrap quota impact, status interpretation, credential setup, merge responsibility, event retention and epoch reset recovery.
- [ ] Document that outbox events are retained in this version. Measure rows/database growth and export file sizes. Do not prune by published PR progress; safe pruning needs independently verified merged checkpoints and a separate retention design.
- [ ] Document this bounded export-only retry, once the workflow exists and is authorized/enabled:

```sh
rtk gh workflow run pihps-history-sync.yml --ref main -f max_events=100
rtk pnpm history:pihps:status --target remote
```

  Both export triggers and manual runs use the same lock, validation and branch protocol. They must not call `ingestRecent`, the scraper, historical import or deployment. Keep bootstrap/reconciliation commands separate and explicitly date-bounded.
- [ ] Run all required code gates with explicit test targets. Include existing history restoration and ingestion tests, because shared contracts changed:

```sh
rtk pnpm typecheck
rtk pnpm exec vitest run src/worker/archive-outbox.test.ts src/worker/d1-store.test.ts src/worker/ingest-state.test.ts src/worker/ingest.test.ts src/worker/index.test.ts src/worker/pihps-health.test.ts scripts/pihps-history.test.mjs scripts/pihps-history-updates.test.mjs scripts/pihps-history-restore.test.mjs scripts/pihps-history-sync.test.mjs scripts/pihps-history-publish.test.mjs scripts/price-import.test.mjs
rtk pnpm build
rtk pnpm history:pihps:validate
rtk pnpm history:pihps:rebuild
rtk git diff --exit-code -- data/history/pihps
```

- [ ] In an isolated clean checkout, restore the base plus fixture updates into local Wrangler D1. Check both unchanged historical 38-province fixtures, a new date, an older corrected date, per-row provenance, zero-write replay and unchanged job/source-day/citizen data. Compare archive tree hashes before/after repeated export and rebuild.
- [ ] Prepare a concrete rollout report: deployed Worker/D1 identity, fresh read-only audit, current trigger settings, account quota, proposed DDL and bootstrap dates/counts/write budget, required secrets/app permissions, proposed workflows, rollback and verification. Follow `docs/qa/pr12/production-rollout.md`. Historical production backfill from #36 remains a separately reviewed operation, not an automatic requirement of archive sync.
- [ ] After rollout authorization, deploy the journal-capable Worker and verify schema; perform only the approved bounded reconciliation; enable export automation and run one controlled synchronization. Capture the resulting PR and merge evidence separately. Register any PR created/worked on with the thread using the available T3 PR-linking tools.
- [ ] Read back actual deployed Worker Cron Triggers and Actions workflow configuration. Observe the next real scheduled Worker event: match UTC/WIB event time, selected survey date, source result, D1 prices/day/job/event, export run and resulting archive PR. Verify a real unchanged later export produces no commit. Mark real-event evidence pending until observed; manual fixture execution cannot replace it.

**Edge Cases:** Missing account access; quota inadequate for bootstrap; app not installed; branch protection blocks merge; corrected triggers not deployed; no real scheduled event observed yet.

**Definition of Done:** Local/code acceptance is evidenced and the runbook is usable. Production automation is declared verified only after authorized rollout, actual trigger readback and real event evidence. Unavailable checks are named explicitly.

## Acceptance coverage and execution order

Execute Tasks 1 through 6 in order. Keep commits centered on each task's deliverable and review its tests before proceeding.

- Controlled daily ingestion to reviewed archive: Tasks 1, 3, 4 and 5.
- Delayed publication and malformed/error preservation: Tasks 1 and 5, with existing ingestion tests retained.
- Older archived correction with provenance: Tasks 1, 2 and 3.
- No duplicate observations/commits/PRs and overlap convergence: Tasks 1 through 4.
- Export failure visible and retryable without ingestion: Tasks 3 and 5.
- Credentials/SQL/raw data excluded: Tasks 2 through 4 and archive allowlist checks.
- Ownership, lag, recovery and actual deployed-event evidence: Tasks 5 and 6.

## Plan review notes

This plan chooses the immutable base plus append-only yearly updates rather than rewriting the audited years. It also chooses polling the durable outbox from Actions rather than adding a GitHub dispatch secret to the Worker. These are reviewable design choices, not implemented changes.

Implementation uncertainties are bounded: actual account quota, GitHub App/environment configuration, branch-protection rules and deployed triggers must be read at rollout. They do not prevent local fixtures and complete implementation preparation. Direct external SQL corrections require explicit reconciliation; discovering never-fetched historical source revisions is outside this issue's existing scheduler contract.
