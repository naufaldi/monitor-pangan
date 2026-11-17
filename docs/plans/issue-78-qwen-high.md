# Issue #78 — Admin moderation decision feedback & recovery (Qwen4-Max high)

## Story

A moderator approves, rejects, or takes down a citizen report in `/admin`. Today only a
401 does anything; every other failure (409 conflict, 404 missing, 500 store, network
loss) is swallowed, and nothing stops two competing decisions on the same report. The
moderator must see honest feedback, get a stale list reconciled, never be told a definite
outcome when the network dropped, and be unable to fire competing actions while one is in
flight. Success reload and 401 session rejection must keep working.

## Approach & rationale

Frontend-bounded. No Worker/schema/API change (none established as necessary). Keep
`laporan-client.ts` untouched so PR #77 (which also edits that file) does not conflict.

Extract one small framework-free seam, `src/components/admin-decision.ts`, that owns the
decision request lifecycle so the hard async behavior is provable with installed tools
(`@effect/vitest`, no DOM library available):

- `decisionFailureKind(status)` pure mapping: 409→conflict, 404→missing, 0→unknown,
  everything else→unavailable. 401 is routed to session rejection before this mapping.
- `DECISION_FAILURE_COPY` pure, honest Indonesian copy per kind. Conflict copy never claims
  a specific moderation outcome (the report may have been decided by someone else). Unknown
  copy states the decision *may already be saved* and offers a reload to reconcile.
- `createDecisionController(post = postDecision)` — an external store with:
  - per-report in-flight guard (`inflight: Record<id, action>`), so approve/reject/takedown
    on the *same* report cannot compete, while different reports stay independent;
  - a single durable `feedback: { scope, kind } | null` slot, owned above the rows so it
    survives row removal / queue loading unmount;
  - a generation token; `invalidate()` bumps it and clears state so a late settlement after
    secret change / unmount cannot fire stale `reload`/`onReject` callbacks;
  - `decide(req)` returns `Effect.Effect<boolean>` (false when guarded). It adds the guard
    synchronously before the first yield, runs `post`, then on settlement clears the guard,
    routes 401→`onReject`, success→`reload`, conflict/missing→feedback+`reload`,
    unavailable/unknown→feedback only (no auto-resubmit). Controls recover on settlement.
  - `subscribe`/`getSnapshot` for React `useSyncExternalStore` (single source of truth).

`AdminDesk.tsx` wires the controller (created once per mount), renders an exported
presentational `DecisionFeedbackMessage` (composed from shared `StatusMessage` + `Button`)
above the lists when `view === feedback.scope`, and passes `onDecide` + per-row `busyAction`
to `PendingItem`/`ReviewedList`. Row buttons disable while that report is in flight and show
"Memproses…" on the running action; note requirements and the takedown two-step are preserved.
The existing `pendingGen`/`reviewedGen` queue guards and photo/401 handlers stay as they are;
the effect cleanup also calls `controller.invalidate()`.

Why a seam instead of all-in-React: `renderToStaticMarkup` and a pure mapping test cannot
prove request counts, the in-flight guard, auth callbacks, refresh, or stale-callback
suppression. The controller proves those behaviorally; the live click→request wiring,
per-row disabled rendering, and feedback persistence across a real unmount are inspected in
the T3 built-in browser. No new dependency, no parallel rule set, no ceremony refactor.

## Owned files

- `src/components/admin-decision.ts` (new) — mapping, copy, controller.
- `src/components/AdminDesk.tsx` (edit) — wiring, feedback placement, row busy/disabled.
- `src/components/admin-decision.test.ts` (new) — controller behavioral + mapping/copy tests.
- `src/components/admin-decision-ui.test.ts` (new) — `DecisionFeedbackMessage` static proof.
- `docs/plans/issue-78-qwen-high.md` (this plan).

Not touched: `laporan-client.ts`, Worker, schema, `packages/ui`, generated files, other issues.

## State owners & invariants

- Owner of decision request state: the controller (one per AdminDesk mount). Queue/reviewed
  data + their generation refs remain owned by AdminDesk exactly as today.
- Invariant: at most one in-flight decision per report id; guard cleared on every settlement
  (success, any failure, 401) and on invalidate.
- Invariant: a settlement whose generation is stale never calls `reload`/`onReject` and never
  writes feedback (protects newer session/state).
- Invariant: feedback lives above the rows; conflict/missing reconcile the *relevant* scope.
- Invariant: unknown outcome never auto-resubmits and never asserts definite success/failure.
- Selected edges: 409, 404, 500/400, network(0), 401, success, competing same-report action,
  different-report independence, stale settlement after invalidate, feedback durability.

## Targeted security

Feedback copy is static and generic: no bearer token, no internal error body, no private
report fields (alias/note/photo) rendered into messages. The secret stays in the existing
Authorization header path; the controller never logs or surfaces it. Admin-only route and
existing 401 session clearing unchanged. Synthetic fixtures only for local proof.

## Performance

No extra happy-path request: success still does exactly one decide + the existing reload.
Recovery adds at most one bounded reload on conflict/missing/unknown-reconcile (a read the
page already performs). Local state only; no measured speed claim. Assessment: no material
network/memory impact.

## Acceptance & proof

- Behavioral (`admin-decision.test.ts`, `@effect/vitest` `it.effect` + `assert`, controlled
  `post` via `Deferred`): guard blocks competing same-report decide (request count stays 1)
  and allows a different report; controls recover on settlement; 401→onReject (no feedback,
  no reload); success→reload + feedback cleared; 409/404→honest feedback + reload of scope;
  500/400→unavailable feedback, no auto-reload; 0→unknown feedback, no auto-reload, copy offers
  reconcile; stale settlement after invalidate fires no callbacks; mapping/copy carry no secrets.
- Presentation (`admin-decision-ui.test.ts`, `renderToStaticMarkup`): each kind renders its
  title/explanation with `role="alert"`; unknown shows a "Muat ulang" action; no token/private
  strings.
- Browser (T3 built-in only): scoped local admin journey with synthetic fixtures/auth —
  inspect request→feedback→reconcile for pending and reviewed, feedback surviving row removal,
  per-row disabled/busy + note requirement, keyboard/pointer, representative width, slow network
  where material. Capture before/after. If a required interaction cannot be inspected, mark it
  unverified and stop local delivery honestly.
- Gates: `pnpm typecheck`, `pnpm test` on the explicit affected files only, `pnpm build`.
  Preserve upstream exit status; save logs to task-local artifacts.

## Delivery & stopping point

Local implementation + verification + this plan. Commit only intended #78 files locally for
immutable review (PR delivery authorized). No push/PR/merge/deploy/worktree-delete/Sol review.
Stop after local delivery or a concrete blocker. Parent inspects diff/evidence, dispatches one
Sol high review, opens the separate PR. Result and performance verdicts reported separately.

## Deviations

(Append meaningful deviations here without erasing the decisions above.)

- Dependency reuse: the worktree had no `node_modules`. `package.json`, `pnpm-lock.yaml`, and
  `packages/ui/src` are byte-identical to the original checkout (`a70439b`, the pre-squash twin of
  base `3a6a971`). Mirrored the installed third-party links into a real `node_modules` dir and
  overrode `@monitor-pangan/ui` to point at this worktree, so first-party source resolves locally
  (verified via `require.resolve`). No installs; git tree stays clean (node_modules ignored).
- UI proof blocker: the T3 built-in browser is disconnected (`[browser.disconnected]`). Per the
  resource rule, no standalone Chrome/Chromium or fallback browser was launched, and no DOM test
  environment is installed (jsdom / happy-dom / linkedom / @testing-library absent). Therefore the
  live-runtime properties — click→request wiring, per-row disabled/"Memproses…" rendering, feedback
  persistence across a real row unmount, keyboard/pointer behavior, representative width, and slow
  network — are UNVERIFIED at runtime. The wiring was source-inspected (feedback rendered above the
  rows from the controller snapshot; rows receive per-report busyAction; cleanup invalidates the
  controller). Bounded proof actually obtained: 8 controller behavioral tests + 1 static presentation
  test (9/9 pass), a guard mutation check that fails without the guard, and typecheck/test/build gates.
  No mock server or dev server was started, since it could not be observed without the browser and
  would consume resources. Parent may open a draft PR disclosing this interaction-proof gap.