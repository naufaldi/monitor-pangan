# Issue #78 — Sol runtime verification

## Identity, authorization, and method

This is authorized implementation verification, not an independent review.
Product head exercised: `e11caf9696317171990f21d04470fc8a89792331`.
Worktree: `/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-5e1c3f3c-3b49075f4f69cd8a`.
Branch: `fix/moderation-feedback-recovery`. Date: 2026-11-17.
Original Qwen plan and historical Sol FAIL verdict remain intact.
No product source changed during this verification.

Used only T3 built-in preview_status/open/navigate/evaluate/act/resize/snapshot/close.
Task-owned tab: `tab_4_08c52d3d-9850-46fc-88ef-70ef0fb9ca03`.
Real Vite-served `/admin`, real React route, AdminDesk, client, controller and
shared UI. A page-scoped fetch wrapper intercepted only `/api/admin/*` and
returned synthetic queue/reviewed fixtures. POST responses and selected list reads
were held for controlled settlement. No replacement component or page was injected.
Login used a synthetic local secret. No real credential, report, Worker, D1 or R2
was accessed. The wrapper delegated non-admin assets to the local Vite server.

## Inspected live behavior

| Journey | Observed result | Evidence |
| --- | --- | --- |
| Login | Enter on the real form opens pending queue | initial state; subsequent Enter login after 401 |
| Pending busy/independence | A approve disables approve, reject, note and evidence select; B remains usable; disabled A rejection click adds no POST; A+B produce exactly two POSTs | states-1 records 2–4 |
| Pending ownership | A response loss (status 0), B success, B new start and success: A warning remains | states-1 records 4–8 |
| Pending recovery/unmount | Manual reload adds one queue GET, no POST. While held, pending row count is zero and warning remains; released fixture removes saved A | states-1 record 8; states-2 record 0 |
| Conflict | 409 automatically reads queue; alert survives loading unmount and empty reconciled list | states-2 records 1–2 |
| Reviewed takedown | First click opens note without POST; empty and whitespace notes block submit; nonempty note sends takedown; held R disables its input/button while S stays usable | states-2 records 3–7 |
| Reviewed ownership | R 500 shows uncertain outcome without read; S success and later start/success retain R warning | states-2 record 8; states-3 records 0–2 |
| Reviewed recovery | Manual reload issues exactly one reviewed GET and removes synthetic saved R without resubmitting | states-3 record 3 |
| 503 at narrow width | Unknown-outcome copy says decision may be saved; reload button reads reviewed list once, no auto-read or resubmit | states-3 records 5–6 |
| Missing | 404 automatically reads reviewed list; S disappears after response and missing-report alert remains | states-3 records 7–8 |
| Session | 401 returns to login; direct sessionStorage presence check returns false; no decision alert remains | states-4 record 0; checks.json |
| Pending keyboard/success | Tab moves from note to Tolak; Enter sends reject with trimmed note. Held request disables competing controls; success removes A, reads queue and leaves no alert | states-4 records 1–4 |
| Pending 500 | Unknown-outcome message and reload action; controls recover; manual click adds one queue GET | states-4 records 5–6 |
| CSS widths | Actual DOM/control states at 1280×800, 390×844, 768×900. Inspected narrow controls fit within viewport; observed scrollWidth equals 390 and 768 at selected states | states-1/3/4 and recorded T3 resize/evaluate output |

JSON record indexes above are zero-based. Fixtures intentionally retain B/S after
some synthetic successes to allow another request and test feedback ownership.
Other synthetic successes/reconciliation remove rows. This exercises frontend
response handling, not actual database persistence. The native disabled-click
attempt used DOM button.click(); main decisions/reloads used preview_act.
Basic keyboard proof covers login Enter and pending rejection Tab/Enter, not a
complete keyboard accessibility audit.

The original controller tests remain the proof for stale-generation suppression.
This live session does not establish every stale settlement across a real secret
change. No additional tests were invented for unrelated keyboard polish.

## Artifacts and checks

Raw inspected evidence under `/tmp/issue-78-sol-ui/`:

- `fixture.js`: exact API interception setup, no product replacement.
- `states-1.json` through `states-4.json`: 36 captured states containing rendered
  text, alert text, row/control disabled/value state, viewport width, focus,
  synthetic POST bodies and GET/settlement trace.
- `checks.json`: 18 successful assertions over live captured states, identity,
  frame limitation, and observed 401 credential-presence result.
- `session-notes.txt`: launch, cleanup, and tooling limitations.

Exported JSON was reopened locally. Additional assertions confirmed manual reload
request deltas for both scopes and exactly A+B POSTs after a competing disabled
click. Initial ambiguous selectors failed strict matching and were corrected to
specific button text; the superseded capture is explicitly labeled setup, not
proof. Initial navigation preceded Vite readiness and returned ERR_CONNECTION_REFUSED;
navigation to the ready local server succeeded. Neither was a product failure.

Commands from this worktree, all through `rtk proxy`:

- `pnpm dev --host 127.0.0.1 --port 3078`: Vite ready, served real app; task server
  stopped with Ctrl-C after proof (exit 130, expected interruption).
- `lsof -nP -iTCP:3078 -sTCP:LISTEN`: exit 1/no listener after cleanup.
- Local Python artifact inspection/assertions: exit 0.
- `git diff --check`: exit 0 for proof-only documentation.

Final-code typecheck, 11 targeted tests, and build from the repair record are
reused because product source/dependencies did not change. No install, full suite,
independent reviewer, remote infrastructure check, or fallback browser was used.

## Honest limits and verdicts

Both native snapshot attempts failed with exactly:

> The browser is not producing screenshot frames. For a desktop tab, show or restore the T3 Code window and try again.

The second attempt followed preview_open(open:true), which still reported
visible:false. No screenshot or recording artifact was produced or claimed.
No further frame retries or HTML-derived fake screenshot. Therefore visual
appearance and before/after screenshot acceptance remain UNVERIFIED.
The exposed native preview APIs provide CSS resize but no documented touch or
network throttling control. Touch behavior and throttled 3G remain UNVERIFIED.
Held requests establish in-flight state and recovery, not 3G performance.
The 390/768 scroll geometry is limited DOM evidence, not a visual pass.

**Result:** PASS for the selected live click/request/feedback/reload lifecycle,
busy controls, cross-report warning ownership, real row removal/unmount,
500/503 uncertainty, 409/404 reconciliation, 401 session recovery, and the scoped
keyboard paths above. Visual, touch, 3G and full stale-session runtime proof remain
incomplete. Parent decides merge acceptance with these explicit limits.

**Performance:** no measured latency or 3G claim. Inspected request traces confirm
one POST plus the existing relevant-list GET after success and one list GET per
manual recovery click; unknown responses add no automatic read or resubmission.
Initial dev mount produced two queue reads; this is distinct from per-decision
request counts. No material performance change was made in this docs-only pass.

**Cleanup/delivery:** synthetic session secret removed, original fetch restored,
zero held reads, task tab closed and task server stopped. Local documentation
commit only. Parent retains push/link/merge ownership. No publish/watch/deploy,
branch/worktree deletion, or historical Qwen/review rewrite.

Engineering lesson: observing a warning before and after a request is stronger
when the trace also proves which report settled and which list actually reloaded.
