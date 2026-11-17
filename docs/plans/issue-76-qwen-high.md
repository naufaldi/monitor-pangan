# Issue #76 — Historical calendar selection must resolve to the last trading day

Agent: Qwen4-Max (high), dedicated implementation delegate. Branch `fix/previous-survey-date`,
base `3a6a971` (origin/main). Plan written before implementation; deviations are appended at the bottom.

## Story

A reader of historical prices picks a weekend or missing day in the date picker (e.g. Sunday
2026-09-13). CONTEXT.md:16-17 says weekends/holidays show the **last trading day**. Today
`nearestDate` in `src/components/DatePicker.tsx` minimizes absolute distance, so it emits Monday
2026-09-14 even though Friday 2026-09-11 exists. The emitted date is displayed and (on home)
written to the URL — incorrect selection, not hidden relabeling. After the fix the same pick
resolves to 2026-09-11 and that observed date stays visible.

Baseline failing evidence (reuse, do not re-probe): Sol's read-only probe recorded in issue #76 —
actual resolver + actual `SNAPSHOT_META.liveDates`, input `2026-09-13`, expected `2026-09-11`,
actual `2026-09-14`.

## Chosen approach and why

Extract the resolver into a pure helper `src/lib/survey-date.ts` (matches the repo pattern of pure
date logic in `src/lib`, e.g. `civil-date.ts`, and gives the existing `@effect/vitest` stack a
testable boundary — the issue explicitly allows this). New rule:

- `resolveSurveyDate(dates, target)` returns the **latest available survey date ≤ target**.
- `dates` is the ascending-sorted survey list both routes already pass (`liveSurveyDates()` sorts
  and dedupes). Validated `YYYY-MM-DD` strings compare lexicographically = chronologically, so a
  reverse linear scan needs no `Date.parse`, clock, or timezone (consistent with `civil-date.ts`).
- Target validation reuses the existing boundary schema `CivilDateSchema` (`src/data/price-schema.ts`,
  already used by `commodity-search.ts` via `Schema.is`).
- **No-predecessor rule (smallest safe choice):** when no available date is ≤ target — target before
  the earliest survey, or invalid/unparseable input — the helper returns `null` and `DatePicker`
  does **not** call `onChange`. The existing valid UI selection is preserved; no observation is
  invented and no future survey is substituted. The controlled input snaps back to the current
  value because state never changes.
- Exact available date returns itself (first reverse-scan hit). Target after the latest survey
  still resolves to the latest, matching today's behavior for that case.

`DatePicker` keeps everything else: native `min`/`max`, prev/next/latest buttons, empty-list
`return null`, `showPicker` click/Enter behavior, shared `Button`/`Input` from `@monitor-pangan/ui`
(checked `packages/ui/src/index.ts`; no new primitive, no restyling). The component doc comment is
updated from "snap to the nearest trading day" to the last-trading-day rule.

Rejected alternative: keep absolute-distance but clamp future candidates — still wrong for gaps
where the previous survey is farther than the next one (the Sunday case itself). Another rejected
option: fall back to `dates[0]` when no predecessor exists — that silently selects a future survey,
which the acceptance criteria forbid.

## Owned files (exact)

| File | Change |
| --- | --- |
| `src/lib/survey-date.ts` | new pure helper |
| `src/lib/survey-date.test.ts` | new focused `@effect/vitest` regression |
| `src/components/DatePicker.tsx` | use helper, null-guard `onChange`, update comment |
| `docs/plans/issue-76-qwen-high.md` | this plan |

No other source, no generated files (`src/routeTree.gen.ts`, `src/data/*.gen.ts` read-only),
no ingestion/db/config, no `packages/ui` change, no dependencies. Other issues (#75/#77/#78/#79,
#46) untouched. Unrelated untracked files in any checkout are not staged.

## State / data ownership and invariant

- Survey date list: `provider.dates()` / `liveSurveyDates()` (sorted, deduped) — unchanged source
  of truth; helper only reads it.
- Home (`src/routes/index.tsx`) owns `tanggal` in URL search; `onChange` navigates, latest clears
  the param. Province overview (`src/routes/provinsi.tsx`) owns local `pinnedDate`. Neither
  ownership changes; the picker only emits a different (correct) resolved date.
- Invariant: **the emitted/displayed date is always an available survey date ≤ the picked date,
  or the selection does not change.** Never a future substitution, never a fabricated observation.

## Selected edges (from the changed path, not a matrix)

1. Exact available date → itself (regression, real `SNAPSHOT_META.liveDates`).
2. Sunday 2026-09-13 → Friday 2026-09-11 with real metadata (the reported failure).
3. Missing weekday inside a gap → previous available survey, not the next one (synthetic fixture;
   a missing weekday is not assumed to be a holiday).
4. No predecessor: before-earliest and invalid targets (`""`, `"not-a-date"`, `"2026-02-30"`) →
   `null` → selection unchanged; empty list → `null` (picker already renders nothing).
5. After-latest target → latest (behavior preserved).

## Security / performance assessment

- Security: no boundary change. Picked input is validated with the existing `CivilDateSchema`;
  invalid input can no longer cause a future-date substitution. No secrets, no new external calls,
  local synthetic fixtures only.
- Performance: **not materially affected** (code-based assessment). Same single linear traversal
  of the in-memory date array (reverse scan with early exit, typically O(1) for recent picks),
  cheaper per element (string compare instead of `Date.parse`). No additional network requests,
  no D1 work, no render-path change beyond the resolver call.

## Acceptance → proof map

| Acceptance | Proof |
| --- | --- |
| Exact date unchanged; Sunday→Friday; gap resolves backward | Red→green `src/lib/survey-date.test.ts` against real metadata + synthetic gap |
| No-predecessor/invalid safe, no future substitution | Same test file (null cases) + browser: type before-earliest date, selection stays |
| Resolved date visible; home URL ownership; province local ownership | Browser: home input 2026-09-13 → displayed 2026-09-11 and `?tanggal=2026-09-11`; provinsi same pick → displayed 2026-09-11, no `tanggal` in URL |
| Prev/next/latest unchanged; empty list no picker; native min/max | Browser: exercise controls after selection; source inspection for min/max + empty-list guard (unchanged lines) |
| Required gates | `pnpm typecheck`, `pnpm test src/lib/survey-date.test.ts`, `pnpm build` — sequential |

Browser proof: task-owned `pnpm dev --port 3001`, host browser tools (preview discovery first,
never human tabs). Before/after pair at the same viewport/state: capture the buggy selection at
clean HEAD **before** editing, then the fixed selection after HMR/reload. Representative desktop
width + narrow/mobile width with touch emulation if the harness supports it; report unsupported
controls as limitations. Slow-network: the resolution path is synchronous and local with no
requests, so 3G is not material to the changed behavior (price loading itself is unchanged);
state this rather than run a ceremonial throttle. Screenshots/logs kept untracked in the session
temp dir, inspected with the read tool. Stop the dev server after proof.

## Execution order

1. Plan (this file) + self-check.
2. Environment: worktree has no `node_modules`; original checkout
   `/Users/naufaldi.satriya/WebApps/monitor-pangan` has a complete pnpm install and its
   `pnpm-lock.yaml`/`package.json` are byte-identical to this base (verified by git diff).
   Reuse it via a gitignored `node_modules` symlink — **no install**. First-party resolution stays
   in this worktree (`tsconfig` paths for `@monitor-pangan/ui`, `#/*` package imports, relative
   imports); verify test/build output paths belong to this worktree. If resolution leaks into the
   other checkout, stop and report BLOCKED.
3. Before-capture in browser at clean HEAD (home, pick 2026-09-13 → observe 2026-09-14 + URL).
4. Extract old resolver verbatim into helper; wire DatePicker (behavior unchanged).
5. Write regression tests for the new contract; run → confirm RED for the intended reasons
   (Sunday case must fail 09-14 vs 09-11, mirroring Sol's probe).
6. Smallest fix: new rule + null contract + DatePicker guard + comment. Run → GREEN.
7. After-capture in browser (same journey, both routes, controls, edges, widths).
8. Gates sequentially: typecheck → targeted test → build. Inspect final diff.
9. Local commit of the four owned files only (authorized immutable review head). No push/PR.

## Risks / stopping point

- Symlinked dependency tree: only third-party modules are borrowed; any first-party leak → BLOCKED.
- Dev server without the local worker: baked snapshot data should render; if `/api` freshness
  calls fail, date selection/display/URL remain inspectable — report exactly what was exercised.
- Browser harness unavailable → interaction proof BLOCKED (tests still stand); no invented screenshots.
- Stop when gates + inspected proof + local commit are done, or at a concrete blocker. Parent owns
  Sol review and PR publication.

## Plan self-check (faldi engineering.md)

Compact story ✓; concrete relevant edges (5, from the changed path) ✓; observable definition of
done (acceptance→proof table) ✓; owners/boundary named (URL vs local state, sorted date list,
invariant) ✓; change directly addresses the recorded failure mechanism (absolute-distance
minimization) ✓; no unresolved material product decision (no-predecessor rule chosen and justified
within acceptance) ✓; proof chosen with the plan, existing coverage checked (no DatePicker test
exists; `civil-date.test.ts`/`data-ui.test.ts` supply the pattern) ✓; gates and stopping point
named ✓. Proceed without another approval round.

## Deviations (appended during execution)

1. **Browser harness fallback.** The native T3 desktop browser was disconnected
   (`browser.disconnected`), so interaction proof used the installed `agent-browser` 0.31.1 CLI
   in an isolated headless session (`--session issue76`), closed after proof. No human tabs touched.
2. **Date entry method.** `fill` and raw keystrokes do not commit values into React's controlled
   native date input (they clear it). Picks were set with the native `HTMLInputElement` value
   setter + a bubbling `input` event — the same event path the native picker commits through, so
   the real `onChange` → resolver → navigate chain is exercised. Prev/next/Terbaru were real clicks.
3. **Touch emulation unavailable.** `set device "iPhone 15"` gives a 393×852 mobile viewport but
   `navigator.maxTouchPoints === 0`; the harness has no touch toggle. Mobile-width layout and
   control operation are proven; true touch behavior is unverified (unchanged `showPicker` code).
4. **No throttled-3G control** in this harness. Not material: resolution is synchronous, local,
   and adds no requests; price loading is unchanged. Disclosed rather than run.
5. **Local worker not running.** `/api/pihps/fresh` and `/api/pihps/health` return 502, so the
   freshness status banner appears in every capture (before and after alike). Baked snapshot
   prices render; selection, displayed date, URL ownership, and controls were exercised through
   the recorded automation. Physical native-calendar entry and true touch remain unverified.
6. **Dependency reuse verified.** `node_modules` symlink to the original checkout's pnpm install
   (lockfiles byte-identical). Test/build output confirms first-party paths resolve in this
   worktree; only third-party modules (e.g. `effect`) load from the borrowed tree. The symlink is
   hidden via the repository's shared Git `info/exclude` metadata and left in place for the
   reviewer's gates. This exclusion is shared across worktrees, not worktree-local.

Behavioral outcome matched the plan exactly; no scope change. Red→green confirmed:
red log shows `expected '2026-09-14' to equal '2026-09-11'` (mirrors Sol's probe), green 4/4.
