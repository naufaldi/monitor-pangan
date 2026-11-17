# Issue #75 — Edited report retry can show "saved" while retaining original values

Agent: Qwen4 Max (alibaba-token-plan/qwen4-max), effort HIGH. Fifth dedicated implementation
agent; owns ONLY #75. Base `3a6a97196b4a6343b6dfae4186ebbc909c6116ef` (origin/main),
branch `fix/report-retry-edited-values`, worktree
`/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa`.

## Story

A visitor submits a citizen price report (e.g. Rp16.000). The Worker persists the row but the
response is lost (network drop). The form shows a generic failure that says "check your entries
and retry". The visitor edits the price to Rp15.000, gets a fresh Turnstile token, and resends.
The client keeps the SAME submission UUID (`LaporForm.tsx:147` `submissionId.current ??= …`) but
builds the body from the CURRENT editable fields (`:148-156`). The backend immutable replay
(`laporan-store.ts:375-376`, `INSERT OR IGNORE :380-398`) acknowledges the ORIGINAL row and never
reissues the receipt token; the HTTP layer deliberately answers a generic `status:"pending"`
(`laporan-http.ts:229-230`). The UI then shows the saved screen, implying the EDITED Rp15.000 was
stored when only the original Rp16.000 exists. Wrong implication. Not a confirmed production
incident; the backend replay is a protection, not the defect. The defect is client-side: a retry
sends mutable field values under a stable idempotency key.

## Chosen approach — client-side stable attempt (no server/API change)

Compare the two options the issue leaves open:

- **Server comparison / 409 contract.** The Worker would compare the replayed body to the stored
  row and signal a mismatch. This needs a normalized-value contract (alias trim, price, photo),
  handling of mutable/expired photo state (pending object moved/deleted after moderation), and the
  `INSERT OR IGNORE` concurrency loser (created=false with values differing from the winner) — all
  without disclosing match/status/token/private fields. Crucially, ANY "your values differ from the
  stored row" signal is a content-match oracle: the issue states arbitrary public UUID possession is
  not authorization to query content matches. A mismatch response would let a UUID holder probe
  stored values field by field. New disclosure surface, new API contract, new concurrency hazards.

- **Client-side stable attempt (selected).** The client already knows the exact normalized payload
  it sent for a UUID. Capture that attempt once, and on retry resend it VERBATIM instead of the
  current editable fields. Edits cannot ride a stable UUID; using edits requires an EXPLICIT new
  report (fresh UUID). This achieves one row per UUID, original values retained, and an honest UI
  with zero new server disclosure, zero API change, and no normalization/photo-expiry/concurrency
  hazards. Smallest sufficient approach. Server, store, schema, and existing privacy tests unchanged.

### Mechanism (LaporForm)

1. Capture the attempt (normalized draft fields + the `File` reference + the downscaled JPEG) right
   before the network send, keyed by the retained UUID.
2. Classify the submit failure:
   - **Definite (nothing persisted):** local field validation, downscale failure, `CheckNotReady`
     (no token, request not sent), HTTP 400 (invalid field or Turnstile rejected — both pre-insert),
     HTTP 503 (photo upload unconfigured — pre-insert). Form stays editable, UUID retained, entered
     data preserved; the visitor fixes input and retries normally.
   - **Uncertain (may have persisted):** network error (status 0), HTTP 500 (store error can be
     post-insert), 200 with an undecodable body, any other status. Enter a recovery lock holding the
     captured attempt.
3. Recovery lock renders a dedicated recovery card (replacing the editable fields) that:
   - shows a read-only summary of the ORIGINAL attempt (commodity, price/unit, place, photo?) so the
     visitor sees exactly what a retry resends;
   - explains the report may already be saved with these original values and that editing cannot
     update it;
   - keeps a fresh Turnstile widget mounted (widgetKey bump on entering recovery);
   - offers two explicit actions:
     - **Kirim ulang laporan** — resend the captured original attempt verbatim (fresh Turnstile token;
       reuse the captured JPEG for upload continuation). Success → existing saved screen. Failure →
       stay locked with feedback.
     - **Mulai laporan baru** — explicit new report: clear the lock, reset the UUID (a fresh one is
       minted on the next send), re-expose the editable form bound to the UNTOUCHED field states (the
       visitor's edits are preserved, not lost), fresh Turnstile widget, and a note that the previous
       attempt may already be saved.
4. No automatic new UUID on edit. The UUID changes only on the explicit new-report action or the
   saved-screen "Lapor harga lain".
5. Identical retry (visitor changes nothing) resends the original → server replays → one row,
   original data, `receiptToken:null` → saved screen shows the existing "private link issued once"
   copy. Happy flow unchanged.
6. Photo identity & upload continuation: the captured JPEG is reused on retry (no re-downscale, no
   substitution of a changed file). On replay the server returns a fresh `uploadUrl` while the photo
   is still pending, so the retry re-PUTs the SAME original JPEG, continuing/completing the upload
   without overwriting it with different bytes. A changed photo file is an edit → explicit new report.

## Affected owners / valid states

- Owner of the retry decision: `LaporForm` (client). New pure rule module `src/data/laporan-retry.ts`
  owns the definite/uncertain boundary and the stable retry body; the component and tests share it.
- New presentational component `src/components/ReportRecoveryCard.tsx` (props-driven, mirrors
  `ReceiptStatus`), composed from existing `@monitor-pangan/ui` primitives (Card/Button/StatusMessage).
  No new primitive, no `packages/ui` edit.
- States: `editing` (no lock) → `pending` → on uncertain failure `locked` (recovery) → retry success
  `saved`, or explicit new-report back to `editing` with a fresh UUID; on definite failure stay
  `editing`. `saved` screen unchanged.
- Invariants:
  - A UUID is never sent with field values different from the attempt captured for that UUID.
  - Entered data is never silently discarded: definite failures keep fields editable; locking freezes
    fields and re-exposes them unchanged on new-report.
  - Replay never reissues the receipt token or reveals persisted status/private fields (server, kept).

## Selected edges (proportional)

- Save-then-lost-response, then EDITED retry → resends original, one row, original price retained.
- Save-then-lost-response, then IDENTICAL retry → one row, `receiptToken:null`, generic pending.
- Never-stored attempt (400 / 503) → definite, no lock, UUID recoverable, edits apply on retry.
- Explicit new-report after an uncertain failure → fresh UUID, edits stored as a second row.
- Alias normalization (trim/empty→null) carried by the captured attempt; photo upload continuation
  on replay (fresh uploadUrl, same JPEG).
- Fresh Turnstile challenge per retry; definite vs uncertain classification boundary.

## Targeted security

- No new server endpoint or response field; no content-match oracle. UUID possession still grants
  nothing beyond the existing generic acknowledgment.
- Replay still returns `receiptToken:null` and generic `status:"pending"`; no alias, photo key,
  review note, or persisted moderation status disclosed. Existing receipt/status privacy assertions
  in `laporan-store.test.ts` are kept untouched and still run.
- The recovery summary shows the visitor their OWN attempt values in their own browser only.

## Performance

Not materially affected. One extra captured object per in-flight attempt (a draft plus an already
produced JPEG blob reference); retry reuses the captured JPEG instead of re-downscaling (slightly
less work). No new network round-trips, no added render passes beyond the recovery card branch.
Code-based assessment; no bundle/runtime budget change expected.

## Acceptance and proof

- `pnpm typecheck`, targeted `pnpm vitest run <files>`, `pnpm build` (sequential, real exit codes).
- New `src/data/laporan-retry.test.ts`: unit classification + stable retry body, and a client↔Worker
  integration through `postReport`'s injectable fetcher backed by the real `handleLaporan` + SQLite
  store (mirrors `api-client.test.ts` / `laporan-store.test.ts`). A fetcher that persists then drops
  the response reproduces save-then-lost-response. Asserts: edited retry resends original price,
  one retained row, original data, `receiptToken:null`, generic pending, never-stored recovery,
  explicit new-report second row, alias normalization + photo upload continuation.
- New `src/components/ReportRecoveryCard.test.ts`: static markup proves the recovery copy and BOTH
  actions (retry original / new report) render from the recovery state.
- Existing `laporan-store.test.ts` privacy/replay assertions kept and re-run unchanged.

## Proof limits (recorded honestly)

- No DOM test harness exists (no jsdom/happy-dom/testing-library; components use static markup). A
  Worker-only/static-markup test cannot establish click→request UX. The component wiring (lock →
  resend captured attempt; new-report → fresh UUID; widget remount) is verified by source inspection
  plus the shared pure rule exercised in the integration test, NOT by a browser click-through.
- T3 built-in browser was disconnected in prior tasks; if unavailable, the running-UI recovery
  interaction (button clicks, widget remount, viewport/touch/throttled-3G) is an unverified proof gap.
  No standalone Chrome/agent-browser/Playwright fallback (host rule). No server started that cannot
  be observed.

## Dependencies / stopping point

- Dependencies restored offline from the warm pnpm store (`pnpm install --frozen-lockfile --offline`,
  1.9s) as the prerequisite for the mandated gates. Interpretation: no NEW dependencies, no lockfile
  change, no project setup scripts (db:setup/scrape/seed), no global tool installs. pnpm ignored
  esbuild/workerd build scripts; vitest baseline confirmed running. Recorded as a deviation note.
- Stop at LOCAL handback: one local commit of #75 files only. No push/PR/merge/deploy/worktree
  cleanup (parent publishes). No repairs after the independent Sol6.1 review.

## Self-check (contract)

- Compact story, concrete edges, observable done: yes (above).
- Named owner/boundary + why the change addresses evidence: client retry payload stability; server
  replay is correct and kept.
- No material unresolved product decision: the issue delegates the design choice; client-only
  selected and justified.
- Proof mapped per criterion; required gates named; stopping point defined.

---

## Execution evidence (appended after implementation; initial decisions above unchanged)

### Files changed (#75 only)

- `src/components/LaporForm.tsx` (M, +119/−32): capture the sent attempt; classify definite vs
  uncertain failure; lock into recovery on uncertain; `sendAttempt` resends the captured draft via
  `retryBody`; `retryOriginal` and `startNewReport` actions; recovery render branch; `submitError`
  split (400 definite vs uncertain). Happy flow and saved screen preserved.
- `src/data/laporan-retry.ts` (new): `AttemptSchema`/`ReportAttempt`, `isDefiniteReject` (400/503),
  `retryBody` (stable payload from the captured attempt).
- `src/components/ReportRecoveryCard.tsx` (new): props-driven recovery card from existing
  `@monitor-pangan/ui` primitives; read-only original summary + both actions + duplicate hint.
- `src/data/laporan-retry.test.ts` (new): 2 unit + 5 integration tests through `postReport`'s fetcher
  backed by the real `handleLaporan` + SQLite store; a fetcher that persists then drops the response
  reproduces save-then-lost-response.
- `src/components/ReportRecoveryCard.test.ts` (new): 3 static-markup tests (copy, both actions,
  pending/error states, duplicate hint).
- `docs/plans/issue-75-qwen-high.md` (new): this plan.

No change to the Worker, store, schema, `packages/ui`, generated files, or existing tests.

### Commands and actual exits (logs outside Git)

Logs: `/private/var/folders/39/sdym6xy92x90bv9qlv4nxg_r0000gn/T/opencode/issue75-logs/`.

- `pnpm install --frozen-lockfile --offline` → Done in 1.9s (warm store). pnpm ignored esbuild/workerd
  build scripts; vitest baseline confirmed running afterwards.
- `pnpm typecheck` → exit 0, "TypeScript: No errors found" (`typecheck.log`).
- `pnpm vitest run src/data/laporan-retry.test.ts src/components/ReportRecoveryCard.test.ts
  src/worker/laporan-store.test.ts src/data/laporan.test.ts` → exit 0, 4 files / 29 tests passed
  (`test.log`). Includes the 17 existing store privacy/replay assertions, unchanged.
- `pnpm build` → exit 0; 9 pages prerendered including `/lapor` (`build.log`).

### Regression demonstration

Temporarily mutated the integration retry to resend the EDITED draft (the original bug) under the
same UUID: the test failed with "the retry payload is the original attempt, not the edit: expected
15000 to equal 16000". Reverted; suite green. The new test catches the original failure.

### Deviations / notes

- Dependencies were absent in the native worktree. Restored offline from the warm pnpm store as the
  prerequisite for the mandated gates (no new deps, no lockfile change, no project setup scripts, no
  global tool installs). This is the only reading of "no installs" compatible with the required gates;
  recorded for the parent.
- Copy refinement beyond the literal plan: the definite-400 message became "Laporan belum terkirim.
  Coba lagi." (dropped "Periksa isian") because local validation already catches field mistakes before
  send and a locked retry cannot edit entries; the uncertain message no longer encourages checking
  input. Aligned with the issue's concern about misleading input-checking guidance.
- `retryBody` skips the redundant client-side `SubmitBodySchema` re-decode of the token; the draft is
  already decoded and the Worker validates the full body. A bad token still yields a definite 400.

### Verdicts

- **Result: PASS (local, scoped).** Happy flow, edited/identical retry, never-stored recovery,
  explicit new-report, alias normalization, photo upload continuation, and replay privacy are proven
  by the integration + unit + static-markup tests and the preserved store suite; gates green.
- **Performance: not materially affected.** One captured draft + existing JPEG reference per attempt;
  retry reuses the JPEG (no re-downscale); no new round-trips or render passes. Code-based assessment.

### Proof limits (honest)

- No DOM harness exists; click→request UX, Turnstile widget remount in the recovery card, and
  responsive/touch/throttled-3G behavior are NOT browser-verified. No T3 built-in browser tool is
  exposed in this session and it was disconnected in prior tasks; per host rules no standalone
  Chrome/agent-browser/Playwright fallback and no unobservable server was started. The component
  wiring is verified by source inspection plus the shared pure rule exercised against the real store.
- Minor follow-up nit (not blocking): focus is not programmatically moved to the recovery heading on
  lock, consistent with the existing saved-screen behavior.

### Delivery state

Local handback only. One local commit of the #75 files. No push/PR/merge/deploy/worktree cleanup
(parent publishes). No repairs after the independent Sol6.1 review.