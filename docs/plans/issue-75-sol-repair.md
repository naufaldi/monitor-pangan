# Issue #75 — Sol repair record

Author: Sol (gpt-6.1-sol). Local implementation and verification only, 2026-11-17.

## Historical binding and compact self-check

- Original Qwen base: `3a6a97196b4a6343b6dfae4186ebbc909c6116ef`.
- Original Qwen candidate: `7f041229c8a938b9783bac16041220e31a35e979`.
- Repair parent: `aba587440057db1060ad554f12f5af4701b13383`, verified clean.
- Branch: `fix/report-retry-edited-values`; existing worktree:
  `/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa`.
- Retained Qwen plan: `docs/plans/issue-75-qwen-high.md`. Original Sol review remains historical
  in `docs/reviews/issue-75-sol-high.md`; only a distinct disposition is appended.
- Story: after an uncertain submission, rejected retries retain the original uncertainty. An
  explicit new report displays the same retained photo that submission uses, with remove/replace.
- Owners: form owns the File and retry context; shared FileInput displays the parent's filename.
  Existing callers can retain local filename ownership by omitting the new optional prop.
- Invariants: same UUID and original draft/JPEG for recovery retry; fresh UUID only on explicit
  new report; no server/API/privacy change. No dependencies, generated source, or other issues.
- Proof: failing-old/passing-fixed component-handler regression; existing Worker/SQLite and
  17 store/privacy tests; typecheck/build; authorized T3-only real-component interaction trace.
- Performance: no extra requests, data copies, or server work; no measured speed claim.
- Stop: local intended-file commit. Parent owns publication, CI, PR update, and merge.

## Repairs and focused regression

1. **P2 retry outcome copy: repaired.** `sendAttempt` passes `isRetry` into `submitError`.
   Rejected recovery attempts now say “Laporan awal mungkin sudah tersimpan” and give a
   context-specific next action. Initial definite rejection copy remains definite and editable.
   The locked attempt and UUID remain untouched; widget release still renews the check.
2. **P2 hidden retained photo: repaired.** Shared `FileInput` accepts optional
   `selectedFileName`; LaporForm passes `file?.name ?? null`. A shared Button removes the
   attachment through `onFile(null)`. Replacement updates the same parent state. Cancelling
   replacement retains the selected file. Clearing the native picker value allows same-file
   reselection. Native input labeling and token styles remain intact.

`src/components/LaporForm.test.tsx` invokes actual form and FileInput handlers with simulated
React hook slots. No DOM renderer is installed or added. Effect execution is real; transport,
photo conversion, and the widget port are synthetic. Its persisted-row Map models save then
response loss; the existing separate integration tests retain real Worker/SQLite coverage.
Effects are excluded from this hook seam, so it does not prove React lifecycle or browser events.
Eight cases cover rejected 400/503 recovery, retained/remove/replace photo submissions, initial
400/503 rejection, and uncontrolled FileInput removal/cancellation/reselection. Rendered recovery
feedback comes from actual LaporForm props, not a disconnected message helper.

With the final tests and both product files temporarily restored to repair-parent source,
`rtk proxy pnpm test src/components/LaporForm.test.tsx` exited **1**: six failures, including both
retry messages and all three retained-photo paths; two initial-reject cases passed. Final product
files were restored byte-for-byte, verified by SHA-256. Existing green gates remain applicable.

## Commands and inspected logs

All commands used the explicit target workdir above and ran sequentially. Logs:
`/tmp/issue-75-sol-repair/` (outside Git).

- `rtk proxy pnpm typecheck` — **exit 0**, `typecheck.log`.
- `rtk proxy pnpm test src/components/LaporForm.test.tsx src/components/ReportRecoveryCard.test.ts src/data/laporan-retry.test.ts src/worker/laporan-store.test.ts src/data/laporan.test.ts packages/ui/src/field.test.ts`
  — **exit 0**, six files / **39 tests**, `test.log`. All 17 store/privacy tests are unchanged.
- `rtk proxy pnpm build` — **exit 0**, nine pages prerendered including `/lapor`, `build.log`.
- Old-source regression above — **exit 1** (expected), `old-source-regression.log`.
- `rtk proxy pnpm dev --port 3075` — Vite ready on localhost:3075; stopped with Ctrl-C,
  **exit 130** (intentional cleanup). Initial meta proxy ECONNREFUSED to local port 8787 was expected:
  no Worker was started. Browser fixtures then supplied local meta/report/upload responses.
- Final diff and whitespace check inspected. No install, full suite, remote infrastructure,
  independent reviewer, push, watcher, merge, or deployment.

## Authorized T3 interaction proof

Parent relayed explicit T3-only UI authorization after gates. `preview_status` returned no tab;
`preview_open` created owned tab `tab_2_08c52d3d-9850-46fc-88ef-70ef0fb9ca03` on real `/lapor`.
No replacement page or product test mode was added. Browser-local fetch interception supplied
synthetic meta, in-memory save/drop/reject responses and upload acknowledgments. A local
Turnstile API stub received calls from the actual loader/mount/release/dispose lifecycle.
Synthetic PNG files used the real application's JPEG conversion. No real reports were sent.

Inspected raw artifact: `/tmp/issue-75-sol-repair/ui-trace.json` (DOM text, button state, requests,
synthetic row state, widget render/reset/remove calls, upload sizes/types and SHA-256 hashes).
Interactions used native T3 typing/click controls plus DOM events/evaluation on the owned tab.

- At 1280×800, synthetic original save then held/lost response disabled the submit action.
  Recovery summary showed original Rp16.000 and a photo. Retry 400 kept the uncertainty copy.
- At CSS 390×844, held retry disabled both recovery actions and set aria-busy on resend.
  Retry 503 retained original uncertainty and explained photo upload unavailability.
- Requests 0–2 kept UUID `4f76ea1c-9323-43ca-9708-38cf208daaed`, original price/place/photo,
  with fresh synthetic tokens. Explicit new report used a different UUID.
- New report displayed `retained.png` after actual FileInput remount. Submission without
  reselection posted photo=true and uploaded a 759-byte JPEG to the synthetic sink.
- Separate recovery/new-report sequences removed the file (visible “Belum ada foto”, photo=false,
  no upload), and replaced it (visible replacement.png, photo=true, distinct 762-byte JPEG/hash).
- A final uncertain original-photo attempt retried successfully under the same UUID. Its uploaded
  JPEG hash matched the equivalent retained black PNG conversion. Stub lifecycle recorded
  resets after rejection, removal/remount on recovery/new report, and disposal on success.
- All recorded `checks` are true. These establish actual UI state/request wiring with synthetic
  service responses, not persistence in a real Worker or real Cloudflare challenge acceptance.

**Screenshot/visual limit:** both `preview_snapshot` attempts failed:
“The browser is not producing screenshot frames. For a desktop tab, show or restore the T3 Code
window and try again.” Calling `preview_open(open:true)` between attempts did not fix frames;
status still reported visible=false. No screenshots were produced or visually inspected.
No browser fallback was used. No touch/throttle controls are exposed by the current preview tools;
CSS resize is not touch emulation, and held synthetic requests are not measured 3G behavior.
One early browser assertion read the asynchronous photo submission before conversion completed;
subsequent DOM/request inspection and condition-based waits confirmed completion. No code fix
was needed for this fixture timing issue.

## Verdict and handback

**Result: PASS for the two scoped behavioral repairs**, based on focused regressions and actual
T3 DOM/request interactions. Screenshot/layout acceptance remains **BLOCKED by missing frames**;
real Cloudflare challenge, touch, throttled network, CI and production remain **UNVERIFIED**.
No claim of complete visual or production acceptance. Parent retains the merge decision.

**Performance: not materially affected (source assessment).** One optional filename prop and
conditional remove control; no extra report requests or backend work. No measured speed claim.

Owned T3 tab closed successfully. Vite process stopped. No task-owned server remains. Local logs
and synthetic evidence remain for parent inspection; worktree retained. Engineering lesson:
preserve both the data and uncertainty of the original attempt across recovery transitions.
