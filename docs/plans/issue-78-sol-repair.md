# Issue #78 — Sol repair after Qwen evaluation

## Attribution and contract

Implementation: GPT-6.1 Sol, separately authorized after evaluation. This repair
does not change the historical Qwen verdict or attribute Sol changes to Qwen.
Original plan: `docs/plans/issue-78-qwen-high.md`.
Original Sol review: `docs/reviews/issue-78-sol-high.md`.
Original Qwen product head: `d0e80dec1aab58d2f64e9bd94e4a30a1ec903414`.
Original base: `3a6a97196b4a6343b6dfae4186ebbc909c6116ef`.
Repair starts at clean `cdf11ddb8d286a44f450c47125225f85407621f1`,
branch `fix/moderation-feedback-recovery`.

Story: A moderator can process different reports without losing another report's
unresolved warning. A lost response or server failure offers an honest manual
list reconciliation before retrying.

## Changes and finding dispositions

1. **Feedback ownership P2: repaired in source and tested.** Feedback includes
   report ID. Start/success only clear the same report's warning. The bounded
   latest-failure slot remains: a newer failure may replace an older failure.
   Session rejection and invalidation still clear session-owned feedback.
   Deferred-controlled tests run A+B, fail A, succeed B, start/succeed B again,
   then retry/succeed A. A's warning survives B in both pending and reviewed scopes.
2. **500 uncertainty P2: repaired in source and tested.** All 5xx responses join
   status 0 in the unknown-outcome category. Copy acknowledges the decision may
   already be saved and offers the existing “Muat ulang” action to inspect the list
   before retrying. 400/403/405 rejection copy asks to check request/access.
   No automatic retry or extra automatic read is added for unknown outcomes.

Inspected API semantics: `laporan-store.ts` updates before loading/converting the
result row; `laporan-http.ts` maps store errors to 500. The actual client maps
fetch rejection to status 0 and non-OK responses to their HTTP status.
No Worker, client, schema, shared UI, generated source, or AdminDesk change needed.
The existing presentation reads the unknown category's reload flag and already
wires a scope-specific reload above the rows. Existing 401, success reload,
409/404 reconciliation, generation guards, required notes, and two-step takedown
remain intact by source inspection and existing targeted coverage where applicable.

## Verification

Fresh commands, executed sequentially from this worktree through `rtk proxy`:

| Command | Exit | Inspected log |
| --- | --- | --- |
| `pnpm test src/components/admin-decision.test.ts src/components/admin-decision-ui.test.ts` before controller repair | 1 (expected) | `/tmp/issue-78-sol-repair/red.log` |
| `pnpm typecheck` final code | 0 | `/tmp/issue-78-sol-repair/typecheck.log` |
| `pnpm test src/components/admin-decision.test.ts src/components/admin-decision-ui.test.ts` final code | 0, 11/11 | `/tmp/issue-78-sol-repair/test.log` |
| `pnpm build` final code | 0, 9 routes prerendered | `/tmp/issue-78-sol-repair/build.log` |

Red evidence: original code clears A's warning to null on B success. The actual
client -> controller -> static presentation test renders definite-failure copy
for synthetic 500 and fails its unknown-outcome assertion. Final tests exercise
500, 503, and lost response through that real client path, assert one POST/no
automatic reload, and render reconciliation copy/action. Synthetic fetch is
restored with Effect acquire/use/release, including on assertion failure.
The missing `node_modules/effect/AGENTS.md` was disclosed during inspection;
the installed Deferred source and nearby existing Effect tests were read.
No packages installed.

**Result:** both reviewed defects repaired with failing-before/passing-after
evidence; required local gates pass. Final diff inspected. This is local source,
controller, and static presentation proof, not live UI acceptance.
**Runtime gap:** browser authorization was pending and no browser/server was
started. Real click wiring, busy controls, row unmount persistence, keyboard,
mobile/touch and slow-network behavior remain UNVERIFIED. No fallback browser used.
**Performance:** not materially affected by source assessment. Happy path remains
one POST plus existing list reload. Recovery uses an explicit single list reload
per click. No polling, automatic retry, or measured performance claim.
**Security:** static generic feedback only; no token/private data/internal errors
rendered. Existing auth handling retained; synthetic credentials/fixtures only.

## Delivery

Local commit only. Parent owns push, PR updates/linking, integration, merge,
and runtime acceptance. No independent review, push, merge, deploy, infrastructure
connection, or worktree/branch deletion performed by this implementation child.

Engineering lesson: a list scope chooses where to reload, while report identity
decides which operation can resolve a warning. An HTTP error alone cannot prove
a write was rolled back.
