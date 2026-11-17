# Issue #79 — Public reports imply photo deletion when no photo was uploaded

- Owner: Qwen4 Max (alibaba-token-plan/qwen4-max, effort HIGH), implementation sub-agent, issue #79 only.
- Base: `main` @ `3a6a97196b4a6343b6dfae4186ebbc909c6116ef`, worktree branch `fix/issue79-photo-deletion-copy`.
- Scope: public photo-slot semantics and copy. No #46 upload config, no #77/#78 changes, no schema/migration.

## Story

A citizen submits a price report with `photo: false`. A moderator approves it as `receipt` or
`board` evidence (a valid choice — evidence describes what the moderator assessed, not whether
bytes were uploaded). The public list then shows "Foto dihapus setelah 30 hari." — asserting a
deletion event for a photo that never existed. A reader cannot distinguish "never uploaded" from
"expired", and the current copy picks the false history for every absent photo.

## Verified mechanism at base

1. `src/worker/laporan-store.ts:379` — `photoKey = body.photo ? pending/… : null`. Null key is legal.
2. `src/components/AdminDesk.tsx:322-328` + `DecideBodySchema` — approve accepts any evidence
   independent of photo presence.
3. `src/worker/laporan-store.ts:309` (`toPublic`) — `hasPhoto = reportHasPhoto(photo_key, reviewed_at, nowMs)`.
4. `src/lib/laporan.ts:33-38` — `reportHasPhoto` returns `false` for **both** null key (never
   uploaded) and expired retention. The public payload (`PublicReport`) carries only
   `hasPhoto: boolean` + `evidence`; photo history is not serialized.
5. `src/lib/laporan.ts:176-189` — `photoPresentation` maps `hasPhoto:false` + receipt/board to
   `"removed"`; `src/components/LaporanList.tsx:84-89` renders `PHOTO_REMOVED_COPY`
   (`src/data/laporan.ts:69`).

First divergence from the honesty contract: step 5. The presentation layer claims a history the
payload cannot prove. Steps 1–4 are correct and stay unchanged.

## Chosen approach

One neutral unavailable state, per the issue's preferred direction. Because the public boundary
cannot distinguish never-uploaded / expired / unknown-history, a single honest state covers all
three; distinct history labels would require a new serialized field and are not required.

1. `src/lib/laporan.ts` — rename presentation `"removed"` → `"unavailable"` in `PhotoPresentation`
   and `photoPresentation`; update the doc comment to state the honesty constraint. `image` and
   `label` branches unchanged; exhaustive `never` switch retained.
2. `src/data/laporan.ts` — `PHOTO_REMOVED_COPY` → `PHOTO_UNAVAILABLE_COPY = "Foto tidak tersedia."`
   True for never-uploaded, expired, and unknown-history alike; asserts no cause or event.
   Shorter than the old copy, so the existing `w-28` slot cannot wrap worse than before.
3. `src/components/LaporanList.tsx` — `PhotoSlot` case rename + import rename. No markup, class,
   or layout change; shared `@monitor-pangan/ui` components untouched (entrypoint inspected).
4. `src/lib/laporan.test.ts` — update the existing focused mapping test where the chosen semantics
   require it (issue permits), extending the same test with the story cases. No new test file, no
   CSS-value assertions, no test ceremony.

Rejected alternatives:
- Copy-only swap keeping `"removed"`: fixes the visible string but leaves a deletion claim in the
  type/state name — the semantic root of the defect — inviting regression.
- New `hadPhoto` public field to split never-uploaded vs expired: new serialization surface and
  schema change; issue explicitly prefers neutral wording without persisted history.
- Banning receipt/board evidence without a photo: restricts valid moderator choices; forbidden by
  the issue.

## Selected edges (changed path only)

| Case | Input | Expected |
| --- | --- | --- |
| Available photo | `hasPhoto:true`, receipt or board | `"image"` (unchanged) |
| Never-uploaded receipt | `hasPhoto:false`, `receipt` | `"unavailable"` (was `"removed"`) |
| Never-uploaded board | `hasPhoto:false`, `board` | `"unavailable"` (was `"removed"`) |
| Expired photo | `hasPhoto:false` after retention | same `"unavailable"` — honest, history unknown at public boundary |
| No evidence | `hasPhoto:false`, `none` | `"label"` (no slot, unchanged) |

Retention lifecycle (`reportHasPhoto`, `PHOTO_RETENTION_MS`, R2 lifecycle) is untouched: expired
photos still stop being served after 30 days; only the claim about them changes.

## State ownership and invariant

- `photoPresentation` remains the single owner of photo-slot semantics; copy constants stay in
  `src/data/laporan.ts`; `PhotoSlot` stays a pure renderer of the state.
- Invariant: **the public photo slot must not assert photo history the payload cannot prove.**
- The rename is enforced across call sites by the exhaustive `never` switches + `pnpm typecheck`.

## Targeted security

No boundary change: static copy only, no new data exposure, no moderation/permission change, no
alias/photo-key/secret surface touched. Photo privacy (bytes served only for `hasPhoto` rows via
`/foto/:id`) and official-price separation (`PublicReport` never feeds `prices_daily`) unchanged.
The fix removes a misleading public claim; it does not alter who may act on whose data.

## Performance

Code-based assessment, not measurement: one string constant replaced, one union member renamed;
identical switch shape and render output structure. Zero added network, D1, R2, allocation, or
render work. No measured performance claim is made or needed.

## Observable acceptance

1. Mapping test asserts the table above; shown to fail against the base implementation for the
   intended reason (red) before the fix, then pass (green).
2. `pnpm typecheck` passes (proves rename covered every call site).
3. `pnpm test src/lib/laporan.test.ts` passes (explicit file target; existing useful assertions
   retained).
4. `pnpm build` passes.
5. Live UI proof: T3 built-in browser only. **Status at plan time: disconnected**
   (`browser.disconnected`). Per host rules no dev servers are started when browser proof cannot
   be observed, and no fallback browser is used. If still disconnected at verification, the
   candidate is delivered with live-UI rendering explicitly unverified; mapping + static render
   path inspection stand as the available proof.

## Proof environment note

Worktree has no `node_modules` and install is not authorized. Two sibling evaluation worktrees
use `node_modules -> /Users/naufaldi.satriya/WebApps/monitor-pangan/node_modules` (symlink). Root
checkout `pnpm-lock.yaml`/`package.json` are byte-identical to this base and `packages/ui` is
source-identical, so the same gitignored symlink is reused here: no install, no network, no
mutation of the root checkout. Logs are saved outside the Git tree under the session temp dir.

## Delivery and stopping point

- Authorized: local commit of intended #79 files on `fix/issue79-photo-deletion-copy` for
  immutable parent review. Not authorized: push, PR, merge, deploy, worktree removal.
- Stop after gates + diff self-review + local commit + handback report. No post-review repair
  loop; parent preserves the first submitted candidate, defects included.
- Blockers that would stop delivery: a failing required gate that cannot be resolved in scope, or
  discovery that the fix requires schema/moderation changes (it does not).

## Deviations (appended during execution)

- No design or scope deviations. Execution followed the plan: red test confirmed the intended
  failure (`Expected: "unavailable", Received: "removed"`, exit 1, 15/16 baseline passing), then
  the four-file fix turned it green (16/16, exit 0).
- Proof environment note realized as planned: `node_modules` symlink to the root checkout created
  (gitignored, sibling-worktree pattern, no install). Kept at handback so the reviewer can reuse
  the same dependency bridge; no servers, ports, or browser tabs were started.
- Browser gap confirmed at verification time: T3 built-in browser returned
  `browser.disconnected`. Per host rules no dev servers were started and no fallback browser was
  used. Live-UI rendering is explicitly unverified; result proof stands on the red/green mapping
  test, typecheck, build, and static render-path inspection (PhotoSlot is a pure switch rendering
  the constant, so the rendered text is fully determined by the tested mapping).