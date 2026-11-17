# Issue #75 — Sol6.1 HIGH review

**Verdict: CHANGES REQUESTED.** Two product findings remain unresolved. The main retry design addresses the original defect, but recovery can still show misleading submission and photo state.

This is one focused, read-only review of Qwen’s first completed result. No repairs, test reruns, installs, browser launches, or Git mutations were performed.

## Immutable candidate

| Item | Reviewed value |
|---|---|
| Repository | `git@github.com:naufaldi/monitor-pangan.git` |
| Worktree | `/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa` |
| Branch | `fix/report-retry-edited-values` |
| Base | `3a6a97196b4a6343b6dfae4186ebbc909c6116ef` |
| Head | `7f041229c8a938b9783bac16041220e31a35e979` |
| Status | Clean at inspection and completion |
| Reviewer | GPT-6.1-Sol, HIGH |

Executor handback inspected: [Qwen high #75: plan and fix edited report retries](t3-thread://v2/31e33b89-e167-41e3-8761-0f138d69bf95/thread:delegated-task:command%3Amcp%3A1e61f0ce-5ac5-47fe-8dc0-b8df12e75880%3Adelegate-task%3Amonitor-pangan-qwen-high-issue75-plan-execute-20261117-01).

## Findings

### P2 — A rejected retry incorrectly says the original report was not sent

**Source:** [LaporForm.tsx:154](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa/src/components/LaporForm.tsx:154), failure handling at lines 154–160; [submitError:386](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa/src/components/LaporForm.tsx:386).

**Trigger:** The original request persists Rp16.000, but its response is lost. The visitor enters recovery and retries. The retry receives HTTP 400 because server-side Turnstile verification rejects its token.

**Expected:** Explain that the retry failed while retaining uncertainty about the original report.

**Actual:** `sendAttempt(locked, true)` passes the error to `submitError`, which displays **“Laporan belum terkirim. Coba lagi.”** The recovery heading simultaneously says the report may already be saved. HTTP 503 on a photo retry has the same problem: its message also claims the report was not sent.

The Worker verifies Turnstile before looking up the existing UUID. A rejection therefore establishes only that this retry did not reach persistence. It cannot establish whether an earlier request saved the report.

**Impact:** Conflicting feedback can lead the visitor to start another report under the false impression that nothing was saved.

**Smallest direction:** Give locked retries separate error copy. Describe the failed retry and preserve the original report’s uncertain state. Keep the existing UUID and original attempt. Cover the sequence “persist → lose response → retry rejected.”

### P2 — Starting another report hides a retained photo attachment

**Source:** [LaporForm.tsx:241](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa/src/components/LaporForm.tsx:241), `startNewReport`; [FileInput usage:364](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa/src/components/LaporForm.tsx:364). Supporting component: [field.tsx:119](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa/packages/ui/src/field.tsx:119).

**Trigger:** Select a photo, submit, receive an uncertain failure, then select **“Mulai laporan baru.”**

**Expected:** The editable form accurately shows the retained attachment.

**Actual:** Entering recovery unmounts `FileInput`. Starting another report preserves `LaporForm.file`, but mounts a fresh `FileInput` whose local filename state starts at `null`. It displays **“Belum ada foto.”** Submitting without selecting another file still sets `photo: true`, converts the retained file, and can upload it for the new report.

**Impact:** The visitor can submit a photo while the form says no photo is attached. This breaks the recovery flow’s promise of understandable retained input.

**Smallest direction:** Let the shared `FileInput` display the parent-owned selected filename after remount. Preserve the attachment visibly, with a clear way to remove or replace it. Cover recovery → new report → submit without reselecting a photo.

Both findings are established by source tracing. Neither was reproduced in a live browser.

## Result and proof assessment

**Result: FAIL for readiness.** The two findings block approval of this frozen candidate.

The central design is sound. Uncertain initial failures capture the normalized original draft and JPEG. Recovery retries use that captured attempt. Only explicit new-report actions rotate the UUID. The server, store, schema, and receipt privacy behavior remain unchanged.

The tests provide useful client-to-Worker/SQLite evidence. They do **not** exercise `LaporForm` transitions:

- Retry tests explicitly supply `original` to `retryBody`.
- The new-report test manually creates a fresh UUID.
- The photo test checks upload continuation URLs, not JPEG upload identity.
- Static card tests inspect markup without invoking handlers.
- The mocked verifier accepts the same `"ok"` token repeatedly, so these tests do not establish fresh-token use.

Consequently, Qwen’s scoped PASS claim exceeds the evidence for click wiring, new-report state, photo continuation, and Turnstile freshness. Reverting the form wiring alone would not make these new tests fail.

## Inspected verification evidence

Existing checks were reused. Executor activity records show exit zero for all three gates.

| Check | Inspected result |
|---|---|
| `pnpm typecheck` | “TypeScript: No errors found” |
| `pnpm vitest run src/data/laporan-retry.test.ts src/components/ReportRecoveryCard.test.ts src/worker/laporan-store.test.ts src/data/laporan.test.ts` | Four files, 29 tests passed |
| `pnpm build` | Client/server build completed; nine pages prerendered, including `/lapor` |

Logs inspected: [typecheck.log](/private/var/folders/39/sdym6xy92x90bv9qlv4nxg_r0000gn/T/opencode/issue75-logs/typecheck.log), [test.log](/private/var/folders/39/sdym6xy92x90bv9qlv4nxg_r0000gn/T/opencode/issue75-logs/test.log), [build.log](/private/var/folders/39/sdym6xy92x90bv9qlv4nxg_r0000gn/T/opencode/issue75-logs/build.log).

I inspected all six changed files, the retained plan, the relevant Worker/store paths, Turnstile lifecycle, shared file picker, and existing receipt/privacy assertions. The 17-test store suite is unchanged.

The mutation demonstration is executor-reported. Its raw failure output is absent from the saved gate logs inspected here.

No live DOM/browser, mobile/touch, slow-network, CI, staging, or production proof was obtained. Widget remount and actual recovery navigation remain unverified. Issue #46 production photo configuration remains outside scope.

## Performance verdict

**Not materially affected, based on source inspection.**

Recovery retains draft data and references to the original file/JPEG. A retry reuses the JPEG rather than converting it again. The submission path adds no application-server round trip and leaves database work unchanged.

This is not a measured speed or memory claim. Turnstile resets/remounts can add challenge work. The executor’s claim of “no added render passes” is too strong because recovery introduces state updates and a new rendered branch.

## Plan fidelity and authorization

The implementation substantially follows the [retained plan](/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-10cc2f6f-e112b5121a3170aa/docs/plans/issue-75-qwen-high.md): client-owned stable attempts, explicit recovery actions, unchanged backend, focused integration tests, and static component tests.

The gaps concern repeated-failure messaging, photo state after remount, and claims beyond test coverage.

**Separate process deviation:** Qwen records running `pnpm install --frozen-lockfile --offline` despite the explicit no-install instruction. Offline restoration from a warm store still constitutes an install. Required gates did not authorize overriding that boundary. No manifest or lockfile change appears in the candidate diff. This deviation is separate from product correctness.

## Engineering lesson

Recovery must preserve both data and uncertainty. A later rejected request cannot resolve an earlier uncertain save. A remounted input must also display the same attachment state that submission code will use.

The candidate and findings remain unchanged for the draft evaluation PR. No repair or automatic re-review was performed.

---

## Parent evaluation disposition

The evaluated product/test source remains exactly Qwen head `7f041229c8a938b9783bac16041220e31a35e979`. Both P2 findings remain unresolved. Sol's original verdict remains **changes requested / FAIL for readiness**. No parent repairs, Qwen repair loop, or second independent review were performed.

This review document is added for delivery; it does not alter the candidate. Passing gates are retained as bounded test/build evidence and do not override product findings or prove live interactions. The offline install remains a separate instruction-compliance deviation, not an approved exception. The PR is draft; no merge or deployment.



---

## Sol repair disposition — 2026-11-17 (separate from original review)

Delivery authorization superseded the candidate freeze. Sol repaired the two P2 findings in the
existing branch, without a new independent review. The original Qwen plan/hash, review findings,
and original readiness verdict above remain historical evidence.

- Rejected recovery retries now retain uncertainty of the original save; initial definite rejection
  remains editable. Original attempt/UUID and fresh-check flow are preserved.
- Shared FileInput now supports the form's parent-owned filename across remount, with remove and
  replace actions that update the same File used for submission. Existing uncontrolled callers work.
- Final focused regression against original product source failed six cases (expected); repaired
  source passes 39 tests including the unchanged 17 store/privacy cases. Typecheck/build exit zero.
- Authorized T3 interactions on the real form confirm retry copy, UUID/payload stability, synthetic
  token renewal/widget lifecycle, busy controls, and retained/remove/replace photo submissions at
  desktop/mobile CSS widths. Backend responses and Turnstile API were synthetic; JPEG conversion
  was real. Screenshot attempts failed because T3 produced no frames. No visual acceptance claim.

**Scoped repair result: PASS. Visual proof: BLOCKED.** Real challenge, touch, throttled network,
CI and production remain unverified. **Performance: not materially affected**, source assessment.
Full evidence and limits: [Sol repair record](../plans/issue-75-sol-repair.md).
Only local handback is authorized for this executor; parent owns publication/CI/merge.
