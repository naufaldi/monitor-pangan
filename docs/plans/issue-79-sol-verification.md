# Issue #79 — Sol runtime verification

Date: 2026-11-17. This is implementation verification, not another independent review.
Product candidate: `f6c53e4eafa33e34b65835a683b94a5d416ad1fc`.
Verified worktree HEAD before this documentation-only addition: `14574f720c6c5e8b2206fc10d83221b51124ca46`.
Worktree: `/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-3587e58d-aba708df25258e34`.
Branch: `fix/issue79-photo-deletion-copy`. PR: https://github.com/naufaldi/monitor-pangan/pull/83.

## Verdict

**PASS for real-app DOM, image loading, and measured geometry. BLOCKED for complete visual acceptance.**
No product defect was found in these bounded checks. No product changes were made.

**Performance: not materially affected, based on the approved code assessment, not measurement.**
The change replaces copy and a presentation-state name. The branch structure, rendered elements,
requests, database operations, and image-fetch behavior are unchanged. Development-server startup
time is not a user-facing performance result.

## Environment and method

Used only T3's built-in preview browser, in an agent-owned tab:
`tab_5_08c52d3d-9850-46fc-88ef-70ef0fb9ca03`.
The real Vite application rendered `/laporan`, including the real `LaporanList` and `ReportRow`.
No replacement page or component was used.

Started the existing `pnpm dev --host 127.0.0.1 --strictPort` command on port 3001.
The unchanged Vite proxy sent API and photo requests to a task-owned, read-only synthetic HTTP fixture
on loopback port 8787. Five valid public report rows used commodity `beras`, place `3273`,
date `2026-11-17`, and clearly synthetic aliases. Other-outlet results were empty.
The two available photos were local 64×64 SVG test images, with no real photo or personal data.

The app decoded the fixture through its existing public response schema. All report and fixture
photo resource entries returned HTTP 200. No production reports, credentials, Worker, D1, R2,
upload configuration, schema, moderation, retention, or security controls were changed.
The unchanged Leaflet map also loaded its ordinary OpenStreetMap tiles; those are not report photos.

## Exercised journey and observed results

Opened `http://localhost:3001/laporan`, waited for the real list, read its DOM and image load state,
scrolled the first report into view, then checked desktop, mobile, and intermediate CSS widths.
Filtering was unnecessary to render the five cases.

| Case | Public input | Observed real report row | Verdict |
| --- | --- | --- | --- |
| 1 | `hasPhoto:false, evidence:receipt` | “Foto tidak tersedia.”, no image, “Struk”, “Ditinjau” | PASS |
| 2 | `hasPhoto:false, evidence:board` | “Foto tidak tersedia.”, no image, “Papan harga”, “Ditinjau” | PASS |
| 3 | `hasPhoto:false, evidence:none` | No photo-slot child, no unavailable claim, “Tanpa bukti”, “Ditinjau” | PASS |
| 4 | `hasPhoto:true, evidence:receipt` | `/foto/synthetic-79-4`, complete image, natural size 64×64, “Struk”, “Ditinjau” | PASS |
| 5 | `hasPhoto:true, evidence:board` | `/foto/synthetic-79-5`, complete image, natural size 64×64, “Papan harga”, “Ditinjau” | PASS |

Exactly two unavailable messages appeared. “Foto dihapus setelah 30 hari” was absent from the
entire page text. All five review badges retained their `ditinjau-arti` description reference.

| CSS viewport | Observed report geometry |
| --- | --- |
| 1280×800 | Card width 1120 px; all five cards had no horizontal overflow and no slot/content overlap. |
| 768×1024 | Card width 721 px; all five cards had no horizontal overflow and no slot/content overlap. |
| 390×844 | Card width 343 px; all five cards had no horizontal overflow and no slot/content overlap. |

At mobile width, the unavailable slot's client and scroll width were both 112 px. A DOM Range
around each sentence returned one text rectangle, 109.140625×14 px. This is geometry evidence,
not inspected screenshot proof. Both image elements retained their 64×64 rendered dimensions.

The browser cannot distinguish never-uploaded from expired history: both have the same public
`hasPhoto:false` representation. Pair the rendered unavailable cases with the existing
`src/lib/laporan.test.ts:65` retention test, which covers both a null photo key and the expiration
boundary, and its presentation test at lines 213–219. Those existing checks were not rerun.

## Screenshot blocker and limits

`preview_status` initially had no tab. Opening the real app with `open:true` created an owned
tab but reported `visible:false`. Two `preview_snapshot(includeImage:true, save:true)` attempts
failed. Before the second attempt, the first row was scrolled into view and `preview_open(open:true)`
was requested again; the tab still reported `visible:false`.

Both attempts returned:

> Preview snapshot failed: Preview automation snapshot failed: The browser is not producing screenshot frames. For a desktop tab, show or restore the T3 Code window and try again.

Stopped after these two failures. No screenshot was produced, opened, or visually inspected.
No baseline before screenshot was available. Old source copy is not a before image.
No alternate browser, headless runner, fake screenshot, or replacement HTML was used.
Screenshot-based appearance and before/after comparison remain BLOCKED.

Resize changes CSS dimensions only. Touch emulation is unavailable in this host, so touch behavior
was not proved. No changed controls require a new touch claim. Throttled 3G is unsupported and
not material to this wording/state-name fix because no network behavior changed.
No device audit, production-volume test, production performance, or new image-privacy claim is made.
Snapshot diagnostics were unavailable with the frame failure; API/image resource status and
task-owned server output were inspected instead. No full console audit is claimed.

## Inspected evidence and reused gates

Raw artifacts remain outside Git at `/tmp/issue-79-sol-ui/`:

- `browser-evidence.json`: initial preview state; desktop, mobile, and intermediate DOM/resource
  results; both exact screenshot errors. The saved JSON was reopened and parsed.
- `dom-probe.js`: exact DOM/geometry/resource probe used for the three widths.
- `fixture-api.mjs`: complete synthetic fixture server, inspected before running.
- `runtime-output.txt`: inspected dev-server/API output and cleanup results.

The DOM outputs and actual resource entries were inspected in the tool results.
The existing review records 16/16 focused tests, passing typecheck, and passing production build.
That valid evidence is reused under this task's explicit instruction. No source changed, so
tests, typecheck, build, and independent review were not repeated. This record does not establish CI,
staging, deployment, or merge.

## Preservation and cleanup

The original plan and review remain byte-identical to the pre-verification HEAD. SHA-256:

- `docs/plans/issue-79-qwen-high.md`: `2493aa6ab4031b47a25a3cb57294caf2415d64b0d3f4be39e71b989453cea715`
- `docs/reviews/issue-79-sol-high.md`: `2e58eca8f50c2c4daba92b98f9c48ea88b7c31bdf57f911a35b328312d8f7667`

Only this new proof record is retained in Git. `git diff --check` passed.
Closed the owned T3 tab. Stopped fixture session 8776 and Vite session 68763 with SIGINT;
both exited 130. A subsequent listener check found neither port 3001 nor 8787 listening.
There were no fixture secrets. Synthetic fixtures and evidence are retained for reproducibility.
No installs, checkout changes, push, PR edits, watch, merge, deploy, or worktree deletion occurred.
Parent owns delivery and resolution of the remaining visual-proof blocker.

A current-state boolean cannot prove an event history. The runtime checks establish the honest
current-state wording while leaving historical cause deliberately unknown.
