# PIHPS History Archive Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current session.

**Goal:** Preserve audited PIHPS history in the current checkout with validation and local restoration.

**Architecture:** Versioned columnar yearly JSON plus a provenance manifest. Separate pure schema/serialization from staged filesystem publication. Reuse #36's derived validation and import planner.

**Tech Stack:** Node 24, Effect Schema, @effect/vitest, SQLite, Wrangler/D1.

## Global constraints

- Initial inclusive range: 2017-03-27 through 2026-09-15.
- 791,426 observations; nulls preserved; 23 omitted weekdays remain unknown.
- No frontend archive imports, production writes, credentials, citizen data or invented source_days.
- Existing official observations win; no changing archive timestamps.
- Work on a feature branch from main; execute inline.

## Task 1: Archive contract and failure-safe publication

**User Story:** As a maintainer, I want a validated deterministic archive so that recovery no longer depends on an old Git object.
**Files:** Add `scripts/pihps-history.mjs`, `scripts/pihps-history-files.mjs`, `scripts/history-pihps.mjs`, `scripts/pihps-history.test.mjs`; extract the validated series traversal in `scripts/price-import.mjs`.
**Interfaces:** `readHistory(directory)` returns `{ manifest, years }`; `buildHistory(derivedDirectory, outputDirectory)` bootstraps hash-pinned input; `rebuildHistory(directory)` validates then republishes canonical bytes; `historyObservations(archive)` returns observations with immutable original provenance.
**Edge Cases:** Duplicate/invalid dates, wrong columns/lengths, nulls, invalid prices, extra files, hash/count drift, out-of-range values, malformed source files, interrupted or overlapping publishers.
**Definition of Done:** Canonical data round-trips; corrupt files fail before publication; previous output survives failure; repeated rebuild has identical bytes.

- [x] Write real parser/filesystem tests. A malformed price must fail even when its file hash is updated; duplicate dates and missing province columns must fail.
- [x] Run `rtk pnpm exec vitest run scripts/pihps-history.test.mjs` and observe missing-function failures.
- [x] Implement Effect schemas, deterministic serializer/statistics and manifest verification, reusing the existing audited recovery contract.
- [x] Implement a sibling stage, exclusive lock, validated publication and rollback; expose CLI validate/build/rebuild entrypoints.
- [x] Run targeted tests plus `scripts/price-import.test.mjs` after extracting traversal.

## Task 2: Bounded restore and complete archive

**User Story:** As a developer, I want a clean checkout to restore local D1 without fetching an obsolete branch.
**Files:** Modify `scripts/seed-d1.mjs`, `package.json`; add yearly JSON and `manifest.json` in `data/history/pihps/`; add `scripts/pihps-history-restore.test.mjs`.
**Interfaces:** `seed-d1.mjs --history-dir data/history/pihps --from 2017-03-27 --to 2026-09-15 --target local --dry-run --existing-db <path> --out data/repairs/history.sql` validates archive and delegates to `planImport`.
**Edge Cases:** Corrupt archive, multiple input flags, out-of-range restore, official disagreement, non-PIHPS collision, newer rows, metadata/citizen retention, duplicate import.
**Definition of Done:** Named validation/rebuild/restore commands work; import matches all 38 cells for 2018-10-09 and 2025-10-30, averages 11700 and 15750, and replay changes zero rows.

- [x] Write failing CLI restore tests against a real SQLite baseline and the two committed fixture files.
- [x] Add the history input option, reject ambiguous inputs and preserve existing importer modes.
- [x] Bootstrap the ten files using hash-pinned recovered source and record full audit counts.
- [x] Run validate, rebuild twice and compare all file hashes.
- [x] Run real local Wrangler in isolated persistence, apply generated SQL, compare both fixtures and replay changes.

## Task 3: Document and verify the recovery contract

**User Story:** As the maintainer, I want trustworthy instructions so that a future restore is repeatable.
**Files:** Update `DATA_SOURCES.md`, `docs/operations/pihps.md`; add `data/history/pihps/README.md`, `docs/qa/issue-37/verification.md`.
**Interfaces:** `pnpm history:pihps:validate`, `pnpm history:pihps:rebuild`, `pnpm history:pihps:restore -- ...`.
**Edge Cases:** Missing old object, clean checkout, divergent baseline, validation failure, unknown coverage and raw-evidence limitations.
**Definition of Done:** Current checkout owns the restore path, archive ownership/provenance and size choice are documented, and required gates pass.

- [x] Replace old-object recovery as the default workflow, retaining it only as historical bootstrap documentation.
- [x] Record exact clean-checkout local-D1 commands and measured results; explain that D1 serves the application.
- [x] Run `rtk pnpm typecheck`, explicit affected tests, `rtk pnpm build`; inspect frontend assets and Git diff.
- [x] Review issue acceptance criteria against evidence and finish on the feature branch.


## Verification outcome

Implemented on `feat/37-pihps-history-archive` from main after #36 merged.
Typecheck, 49 tests across six explicit files, and production build passed.
An isolated source export with no old Git objects or ignored archive restored
791,426 prices through real local Wrangler/D1. Both 38-cell fixtures matched;
replay preserved the full-row checksum, and a refreshed plan had zero inserts or
updates. Two rebuilds preserved every archive file byte-for-byte. Independent
review found no issues and compared every price/null with the pinned originals.
See `docs/qa/issue-37/verification.md` and `.json`. No production changes.


Follow-up requested Sol High security/KISS/DRY and regression review found one
numeric-argument dispatch bug. Fixed with built-in option parsing and a red/green
CLI regression test. Both reviewers approved the fix; final gates passed with
50 targeted tests. See the issue-37 verification record for details.
