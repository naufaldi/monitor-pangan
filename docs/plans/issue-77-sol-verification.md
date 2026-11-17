# Issue #77 — Sol runtime verification

This is bounded runtime verification of the repaired candidate, not another independent review. The original Qwen plan and Sol review remain unchanged.

## Candidate and environment

- Verified product head: `84a65dd5866dff4563f51edd84c7ce14f5dfb8a0`.
- Base: `3a6a97196b4a6343b6dfae4186ebbc909c6116ef`.
- Worktree: `/Users/naufaldi.satriya/.t3/worktrees/monitor-pangan/t3-54208693-df39e99d52fdbff2`.
- Branch: `fix/report-window-capacity`; initially clean and tracking its origin branch.
- Local Vite development app, actual `/laporan` route. Synthetic API only; no Worker, D1, R2, submission, installation, or infrastructure operations.
- Existing fixture read before use: `/private/var/folders/39/sdym6xy92x90bv9qlv4nxg_r0000gn/T/opencode/issue-77-proof/fixture-api.mjs`, SHA-256 `92d820578dabf5ffffa8a022468a6df298134d3652b2ed5851878712f9b05c8d`.
- T3 built-in browser only. Task-owned tab `tab_3_08c52d3d-9850-46fc-88ef-70ef0fb9ca03`, owner agent, opened with `open:true`; host still reported `visible:false`. Closed before handback.
- Browser-local fetch wrapper recorded real API queries/statuses and held three requests for a controlled stale-result check. It did not inject React components or replace the app. Real menu/retry/list controls were clicked through T3. DOM-derived data attributes identified option buttons because screenshot refs were unavailable.

## Runtime results

| Journey | Observed evidence | Result |
| --- | --- | --- |
| Complete desktop, 1280×800 | Minyak Goreng: three map marker elements; Pasar median Rp 13.250/liter, 3 cities / 12 reports; Ritel separately 2 cities / 8 reports | PASS, DOM |
| Capacity | Beras Pasar has 2,100 fixture rows. Exactly 20 window requests at limit 100, cursors absent then 100 through 1900. One Ritel window plus one selected-outlet list request at limit 20: 22 requests total. No cursor 2000 | PASS |
| Capacity rendering | Correct final commodity-selection hint. No map, numerical median/counts, report list, empty claim, older-page control, or retry. Filters retained | PASS, DOM |
| Capacity → commodity recovery | At 390×844, actual Minyak Goreng selection restored three pins and complete 12-report median with three new requests | PASS |
| Transient failure → retry | Fixture control armed Gula Pasir 503; error and retry rendered with no map. Disarmed failure; actual “Coba lagi” click issued fresh three requests returning 200 and rendered 10-report complete median | PASS |
| True selected-window empty | Telur Ayam Ras: Pasar window/list return empty with null continuation; zero pins, honest empty text and 0 cities / 0 reports. Ritel's separate complete 8 reports remain correctly labelled | PASS |
| Pending → filter change → late completion | Held all three Minyak Goreng requests; loading text replaced old aggregates. Selected Telur while held; empty state completed. Released older requests; all returned 200, but Telur URL, zero pins and empty counts remained; no older Minyak median published | PASS |
| Older list paging | Actual older-page click requested `window=0&limit=20`; September reports appeared without changing empty 30-day window/pins | PASS |
| CSS widths | 390×844 capacity/recovery/error/empty; 768×1024 empty; initial desktop 1280×800. No document horizontal overflow at measured narrow/intermediate states. Capacity buttons measured 44px high | PASS for DOM geometry only |
| Basic keyboard | Focused trigger + Enter opens menu and focuses “Cari komoditas”; Escape closes it | PASS for activation/closure; see focus observation |

The fixture uses finite offset cursors and null continuation on completion. The capacity fixture's page at cursor 1900 returns a live cursor 2000. Initial complete navigation generated two copies of the three-request batch in development; the isolated capacity selection generated exactly the 22 requests above. Do not confuse initial development requests or the list page with the window cap.

A first attempted CSS option selector matched no element. T3 click and subsequent text wait timed out while the old complete state remained. Raw evidence retains that harness failure explicitly labelled; a DOM-derived selector then clicked Beras and all capacity assertions passed. This was not a product failure.

## Precise proof limits and observation

Two native `preview_snapshot({includeImage:true,save:true})` attempts failed with the exact message:

> Preview automation snapshot failed: The browser is not producing screenshot frames. For a desktop tab, show or restore the T3 Code window and try again.

No fallback browser or further frame retry loop was used. Final pixel inspection and a native after screenshot are **BLOCKED**. Touch emulation and a standard 3G throttle control are unavailable in the exposed T3 tools: **UNVERIFIED**. CSS resize is not touch proof. Held requests prove pending-state handling, not measured 3G behavior or latency.

Opened and visually inspected the existing three historical desktop PNGs under the original fixture directory: `01-desktop-complete-baseline.png` (three pins), `02-desktop-complete-median.png` (12-report median and separate Ritel floor), and `03-desktop-capacity.png` (hidden data, original incorrect hint). They support historical layout only; the capacity PNG predates the Sol string repair and is not a final after image. No new screenshot was produced.

Control observation for parent disposition: after Escape closes CommoditySelect, focus moves to BODY instead of returning to the trigger. Enter on BODY consequently does not reopen it; explicit trigger focus + Enter works. Inspection of `src/components/CommoditySelect.tsx` confirms Escape only closes the menu. That file is unchanged in this candidate's base-to-head diff. No repair was made because it is outside the bounded capacity repair and does not prevent the demonstrated filter recovery. This is a concrete existing keyboard issue, not an approval or claim of full keyboard accessibility.

## Performance and checks

**Result:** requested data-state journeys PASS on actual UI DOM/request evidence. Full UI acceptance remains incomplete because native final screenshots, touch, and throttled 3G proof are missing. No new defect in the repaired capacity behavior was observed.

**Performance:** not materially affected by the Sol string-only repair. Source inspection confirms at most 20 sequential pages × 100 rows per outlet window and Effect concurrency 3 for two windows plus initial list. At most 41 initial requests if both windows complete at their bounds; this fixture's capacity case used 22. Maximum fetched window rows remain bounded at 4,000 across two windows, plus initial list; failure does not publish them as complete aggregates. No measured speedup, latency, production-volume, real-device, memory-profile, or production-load claim.

Existing focused 13-test/typecheck/build evidence was reused as authorized; those commands were not rerun. CI passing is supplied parent context, not a fresh host check by this verifier. Only proof documentation is retained in Git.

All shell commands used RTK. `git status`, `rev-parse`, diff-name inspection, fixture/log/source reads, fixture control POSTs, artifact writes, hash inspection, process identity inspection and task-owned TERM commands completed with exit 0. Initial and final `lsof` found no listeners (exit 1). Runtime commands:
- `rtk proxy node <fixture-api.mjs> > /tmp/issue-77-sol-ui/fixture.log 2>&1`: session 56043; node PID 64356; stopped with TERM after identity inspection, wrapper exit 143.
- `rtk proxy pnpm dev --host 127.0.0.1 > /tmp/issue-77-sol-ui/vite.log 2>&1`: explicit target workdir, session 81025; Vite PID 64601; stopped with TERM after identity inspection.
- `git diff --check` is the documentation gate; its outcome is recorded in handback.

Raw evidence outside Git:
- `/tmp/issue-77-sol-ui/dom-evidence.json`: inspected UI text, geometry, assertions, request subsets and failed harness/focus observations.
- `/tmp/issue-77-sol-ui/request-trace.json`: browser-local request ledger and API resource entries.
- `/tmp/issue-77-sol-ui/fixture.log`: actual synthetic API requests/statuses, including 503 and older list request.
- `/tmp/issue-77-sol-ui/vite.log`: development server output.
- `/tmp/issue-77-sol-ui/fixture-api.mjs`: unchanged copy of inspected original fixture for reproducibility.

Only local proof-documentation commit is authorized for this child. No push, PR mutation, merge, deployment, checkout, rebase, branch update, or worktree change was performed.
