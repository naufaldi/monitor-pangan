# Issue #77 — report-window capacity fix (Qwen4-Max high)

Base `3a6a971` · branch `fix/report-window-capacity` · worktree `t3-54208693-df39e99d52fdbff2`.

## Story

As a Laporan Warga reader, when one outlet/filter has more reviewed reports in the
30-day window than the loader can fetch (20 pages × 100 rows), I get an explicit
"window too large to load completely" message with usable narrowing recovery —
never a map/province summary that silently presents truncated rows as the full window.

## Evidence reused

Sol's isolated probe (audit `/tmp/monitor-pangan-astra-evaluation-20261116/sol-original-audit.md`):
actual `loadWindow`, 2100 synthetic rows → 2000 rows, 20 calls, cursor `"2000"` left,
Effect success. Proves loader truncation only; not HTTP decoding or browser behavior.
Store (`src/worker/laporan-store.ts:414-451`) sets `nextCursor` only when an extra row
exists, so a non-null cursor after page 20 strictly means more reviewed data. No 2000 cap.

## State, invariant, owner

- Owner: route `src/routes/laporan.tsx` request state (`requestGen` stale-guard, unchanged).
- Invariant: `loadWindow` succeeds **only** when a page returns `nextCursor == null`
  within the 20-page bound; otherwise it fails with a typed capacity error.
- Invalid combination removed: `status === "ready"` with an exhausted window.
- Selected/other-outlet windows stay separate (`mapAndProvinceRows` unchanged);
  list page and `loadOlder` stay independent and unchanged.

## Chosen fix (smallest plausible)

1. Extract `loadWindow` from the route into `src/data/laporan-client.ts` beside
   `fetchReports` (real-boundary testing without importing the Leaflet route).
   Add optional `fetcher: typeof fetch = fetch` to `fetchReports`/`loadWindow`,
   matching `postReport`/`fetchSnapshot` convention. Behavior-preserving extraction first.
2. Keep the 20-page bound (`WINDOW_MAX_PAGES`, `MAX_PAGE_SIZE`). Return rows only on a
   null cursor; after page 20 with a live cursor, fail `WindowCapacityError`
   (`Data.TaggedError`, no payload — no report data in errors).
3. Route: `RequestStatus` gains `"capacity"`; `onFailure` discriminates by `_tag`.
   Capacity clears rows like the existing error path (no aggregates rendered, so no
   unqualified counts/medians/no-report claims) and shows shared `StatusMessage`
   `tone="error"` with capacity copy from `src/data/laporan.ts`. **No retry button**:
   retry cannot fix persistent volume; recovery is the still-visible outlet/commodity
   filters. Transient failures keep the existing error copy + "Coba lagi".
4. No `packages/ui` change needed (existing `StatusMessage`/`Button` fit); no worker,
   schema, or dependency change.

## Files

- `src/data/laporan-client.ts` — fetcher param, `WINDOW_MAX_PAGES`, `WindowCapacityError`, `loadWindow`.
- `src/routes/laporan.tsx` — import loader, capacity status branch + copy.
- `src/data/laporan.ts` — `WINDOW_CAPACITY_COPY`, `WINDOW_CAPACITY_HINT`.
- `src/data/laporan-client.test.ts` — new focused regression (below).
- `docs/plans/issue-77-qwen-high.md` — this plan; deviations appended after implementation.

## Selected edges

- Empty window and normal multi-page completion: unchanged success.
- Exactly 20 full pages, final cursor null: success (2000 rows, 20 calls).
- Continuation after page 20 (2100 rows): typed capacity failure, exactly 20 calls.
- Mid-window page failure (503): `LaporanClientError`, distinct from capacity; retry kept.
- Filter/retry stale-result protection: `requestGen` logic untouched.

## Targeted security

Reviewed-only filtering stays server-owned (worker SQL untouched). Error UI carries
static copy only — no report rows, aliases, or private fields. Browser proof uses
local synthetic GET fixtures only; no submissions, no secrets, no remote infra.

## Performance (bounded assessment, no measurement claim)

Request bound unchanged: ≤20 pages/window × 2 windows + 1 list page, concurrency 3.
Memory bound unchanged: ≤2000 rows/window held. Capacity path stops at the same 20
requests as before; no extra work added. Verdict expected: not materially affected.

## Acceptance and proof

1. Failing-first regression at the real loader boundary (real `fetchReports` + Schema
   decode, synthetic API-shaped pager via injected fetcher): 2100-row case fails with
   `WindowCapacityError` after fix; was truncated success before. Plus completed,
   empty, exactly-20, and 503 cases. `@effect/vitest` + `assert`, no banned constructs.
2. Gates (sequential): `pnpm typecheck`; `pnpm test src/data/laporan-client.test.ts
   src/data/receipt-client.test.ts src/data/laporan.test.ts`; `pnpm build`.
3. Browser journey proof (task-owned dev server + synthetic API on 127.0.0.1:8787,
   scenario keyed by outlet/commodity): complete baseline with map pins + province
   median; capacity message with no aggregates; filter narrowing recovers; 503 →
   error + retry succeeds. Desktop + mobile widths, touch emulation and throttled
   network where the harness supports them; limitations recorded honestly.
4. Dependencies: worktree has no `node_modules`; symlink to the original checkout's
   install (package.json + lockfile verified equal, `node_modules/` gitignored).
   First-party resolution stays worktree-local via tsconfig paths + `#/*` imports;
   proven by new exports existing only in this worktree once tests pass.

## Risk and stopping point

- Risk: capacity hides the list too (whole batch fails) — accepted, matches existing
  error behavior and the issue's smallest candidate; partial presentation is the
  explicitly out-of-scope alternative.
- Risk: dev-server/browser proof is synthetic, not production volume or real D1.
- Stop: locally verified change + issue-only local commit. No push/PR/merge/deploy;
  parent owns Sol review and publication. No cursor-cycle hardening (not reproduced).

## Deviations and verification record (appended after implementation)

1. Discrimination uses `error instanceof WindowCapacityError` instead of a `_tag`
   string compare — type-safe and keeps the import used (`noUnusedLocals`).
2. Dependency reuse executed as planned: `node_modules` symlink to the original
   checkout (package.json + pnpm-lock.yaml byte-equal, `node_modules/` gitignored).
   First-party resolution proven worktree-local: the new `loadWindow` /
   `WindowCapacityError` exports exist only in this worktree and the tests resolve them.
3. Gates ran once on the final source state, sequential:
   `pnpm test src/data/laporan-client.test.ts src/data/receipt-client.test.ts src/data/laporan.test.ts`
   → 13/13 pass (capacity case failed pre-fix with truncated `Right`, proving the regression);
   `pnpm typecheck` → clean; `pnpm build` → 9 pages prerendered.
4. Browser proof (desktop 1280×900, chrome-devtools MCP, synthetic fixture API):
   complete baseline + province median captured and inspected
   (`01-desktop-complete-baseline.png`, `02-desktop-complete-median.png` —
   "Median 3 kota, 12 laporan, 30 hari terakhir.", ritel floor rollup separate);
   capacity state captured and inspected (`03-desktop-capacity.png` — honest copy,
   no map/median/count/empty claims, no retry button, filters usable). Network log:
   exactly 20 window pages (cursor 0→1900) + 1 other-outlet + 1 list page; no 21st request.
5. **User resource pause**: the chrome-devtools MCP headed Chrome made the Mac heavy.
   Browser verification paused by user instruction; task-owned page navigated to
   about:blank, automation Chrome PID 87557 SIGTERMed (pipe-exclusive to this session's
   MCP, launched by my `new_page`), fixture API (87407/87409) and vite dev
   (87406/87410/87439) SIGTERMed; ports 3001/8787 released; user Chrome (95119) untouched.
   Remaining UI proof gaps (NOT-RUN, paused): mobile width + touch emulation,
   throttled 3G, transient-503 error + retry journey, filter-narrowing recovery journey,
   empty-window browser state. Loader-level equivalents are unit-covered; route error/retry
   and recovery paths are unchanged code except the discrimination line (inspected).
   Proof dir: `/private/var/folders/39/sdym6xy92x90bv9qlv4nxg_r0000gn/T/opencode/issue-77-proof/`
   (fixture-api.mjs restartable with `node fixture-api.mjs` + `pnpm dev --port 3001`).
6. Result verdict: loader contract and desktop capacity/complete presentation PASS on
   inspected evidence; listed UI journey edges remain unverified (paused), not failed.
   Performance verdict: not materially affected — request/memory bounds unchanged
   (code assessment + observed 22-request capacity load); no speedup claimed.
