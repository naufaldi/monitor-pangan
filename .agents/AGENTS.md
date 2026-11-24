# AGENTS.md — Monitor Pangan

This is the Monitor Pangan repo. Base branch is `main`. Use `pnpm` from the repo root.

## Stack

TanStack Start + TanStack Router + React 19 + Vite 8 + Tailwind 4 + Leaflet, Cloudflare D1 (`db/schema.sql`) via Wrangler. TypeScript 5.8, ESM (`type: module`), `strict: true`.

## Monorepo layout

- `packages/ui/` is the single shared frontend package (`@monitor-pangan/ui`).
- The app lives at the repo root (`src/`). Root `package.json` declares `workspaces: ["packages/*"]` and depends on `@monitor-pangan/ui` via `workspace:*`.
- `tsconfig.json` maps `@monitor-pangan/ui` to `./packages/ui/src/index.ts` and `#/*` to `./src/*`.
- Do not create a second button, card, badge, input, or select implementation in the app.

## Reusable components (always)

Always build UI from reusable components in `@monitor-pangan/ui`. Consistency comes from one implementation per pattern.

- Before writing markup, check `packages/ui/src/index.ts` for a component or class helper that already does the job, and use it.
- If one exists but doesn't fit, extend it with a prop or variant in `packages/ui`. Do not fork it or restyle it in the call site.
- If a pattern has no shared component yet and shows up a second time (select, search box, option row, stat, delta, card header, table cell, page shell, toolbar, empty/error state), move it into `packages/ui`, export it from `index.ts`, and replace both copies in the same change.
- Components in `packages/ui` take data through props and never import from `src/`. App-specific logic stays in `src/components`, composed from the shared pieces.
- Style shared components only with tokens. Callers pass `className` for layout (spacing, width, grid), not for color, border, radius or typography.

## Layout

- `src/routes/` — file routes (`__root.tsx` owns header and `Navbar`, `index.tsx` owns map plus table, `tren.tsx` owns trends plus movers)
- `src/components/` — presentational components driven by props from `src/data/provider.ts`
- `src/data/provider.ts` — `PriceDataProvider` contract UI renders against
- `src/data/*.gen.ts`, `src/routeTree.gen.ts` — generated, do not edit
- `scripts/*.mjs` — PIHPS / Panel Harga scrape, normalize, seed
- `db/schema.sql`, `data/snapshots/latest.json`, `DATA_SOURCES.md`
- Domain glossary: `CONTEXT.md`. Never present `Data contoh` as official data.

## Frontend UI system

Single source of truth is `packages/ui/`.

- `packages/ui/src/tokens.css` owns all design tokens. `src/styles.css` imports it and adds only base layers and Leaflet overrides.
- `packages/ui/src/primitives.tsx` owns `Button`, `Card`, `Badge`, `Input`, `Select` plus the `buttonClass`, `cardClass`, `badgeClass`, `inputClass`, `selectClass` helpers and `cn`.
- `packages/ui/src/index.ts` is the only public entrypoint. Import from `@monitor-pangan/ui`, never by relative path into `packages/`.
- Use tokens (`bg-paper`, `bg-canvas`, `text-ink`, `text-slate`, `border-hairline`) for chrome. Do not hardcode hex for chrome.
- Commodity picking uses the grouped `CommoditySelect` combobox, not a tab strip.
- `src/routes/tren.tsx` keeps the exhaustive `switch` with a `never` default for direction labels.

## Commands

```sh
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm build       # route generation plus production build
pnpm test        # vitest run
pnpm dev --port 3001
```

## Effect Conventions

Effect is a runtime dependency. Before changing Effect code, read the effect-ts skill + nearby source.

- Skill: `.agents/skills/effect-ts/SKILL.md`; API source: `node_modules/effect/src`.

- Prefer `Effect.gen` and `Effect.fn` for programs, `Context.Tag` class-extends idiom with `Layer` for services.
- Use `Schema` for all external validation, typed errors over thrown exceptions.
- Do not use `async` / `await`, `try` / `catch`, `Date.now` or `new Date` (use `Clock`), or `Effect.runSync` in tests.
- Wrap existing async APIs with `Effect.tryPromise`, exit with `Effect.runPromise`.
- Tests use `@effect/vitest` (`it.effect`, `it.live` already provide a `Scope`) with `assert`, never Vitest `expect`. Do not wrap test bodies in `Effect.scoped`.
- Keep changes focused, follow patterns in `src/data/provider.ts`.

## Proof, scaled to risk

- High risk (payments, auth, permissions, migrations, data writes, concurrency): a regression test that fails before and passes after, plus an integration test on the real flow.
- Normal (app feature or bug fix): add one test of user-visible behavior or extend an existing one.
- Low risk (copy, styling, docs, config, or refactors covered by existing tests): no new tests. Run affected existing checks; docs-only edits need no app tests while working.
- Every UI change: capture and inspect before and after screenshots of the same screen and steps. Link both in the PR.
- Run `pnpm typecheck` and `pnpm build` for code changes. Run affected tests with `pnpm test <file>` while working. Before merging, rebase onto the latest `main` and run `pnpm test` locally on that exact commit. If `main` moves again, rerun the full suite only when the new commits touch the same packages or areas; otherwise rerun the affected tests. Do not rely on CI for this gate.
- Rerun an unrelated flaky test once. If it still fails, skip it with an issue link and continue. Fix it only if it blocks all merges.
- Do not start test-only, audit, or tooling work unless requested or it blocks a release. Note the gap in the PR. Report what you checked, the result, and any check you could not run.

## Generated Files

Do not edit `src/routeTree.gen.ts` or `src/data/*.gen.ts`. Update their sources and regenerate.
