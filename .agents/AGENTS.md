# AGENTS.md — Monitor Pangan

This is the Monitor Pangan repo. Base branch is `main`. Use `pnpm` from the repo root.

## Stack

TanStack Start + TanStack Router + React 19 + Vite 8 + Tailwind 4 + Leaflet, Cloudflare D1 (`db/schema.sql`) via Wrangler. TypeScript 5.8, ESM (`type: module`), `strict: true`.

## Monorepo layout

- `packages/ui/` is the single shared frontend package (`@monitor-pangan/ui`).
- The app lives at the repo root (`src/`). Root `package.json` declares `workspaces: ["packages/*"]` and depends on `@monitor-pangan/ui` via `workspace:*`.
- `tsconfig.json` maps `@monitor-pangan/ui` to `./packages/ui/src/index.ts` and `#/*` to `./src/*`.
- Do not create a second button, card, badge, input, or select implementation in the app.

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
- Before UI polish, motion, or mobile-feel changes, read the vendored Emil Kowalski skills. Skill: `.agents/skills/emil-design-eng/SKILL.md`. Same pack: `.agents/skills/animate/SKILL.md`, `.agents/skills/animate-expo/SKILL.md`, `.agents/skills/animation-vocabulary/SKILL.md`, `.agents/skills/apple-design/SKILL.md`, `.agents/skills/ask-sonner/SKILL.md`, `.agents/skills/find-animation-opportunities/SKILL.md`, `.agents/skills/improve-animations/SKILL.md`, `.agents/skills/mobile-native/SKILL.md`, `.agents/skills/pick-ui-library/SKILL.md`, `.agents/skills/prototype/SKILL.md`, `.agents/skills/review-animations/SKILL.md`, `.agents/skills/write-swift/SKILL.md`.

## Commands

```sh
pnpm install
pnpm typecheck   # tsc --noEmit, required gate
pnpm build       # route generation plus production build, required gate
pnpm test        # vitest run
pnpm dev --port 3001
```

`pnpm typecheck` + `pnpm test` + `pnpm build` are the gates. Report commands you could not run.

## Effect Conventions

Effect is a runtime dependency. Before changing Effect code, read the effect-ts skill + nearby source.

- Skill: `.agents/skills/effect-ts/SKILL.md`; API source: `node_modules/effect/src`.

- Prefer `Effect.gen` and `Effect.fn` for programs, `Context.Tag` class-extends idiom with `Layer` for services.
- Use `Schema` for all external validation, typed errors over thrown exceptions.
- Do not use `async` / `await`, `try` / `catch`, `Date.now` or `new Date` (use `Clock`), or `Effect.runSync` in tests.
- Wrap existing async APIs with `Effect.tryPromise`, exit with `Effect.runPromise`.
- Tests use `@effect/vitest` (`it.effect`, `it.live` already provide a `Scope`) with `assert`, never Vitest `expect`. Do not wrap test bodies in `Effect.scoped`.
- Keep changes focused, follow patterns in `src/data/provider.ts`.

## Validation

| Change type | Validation |
| --- | --- |
| Code changes | `pnpm typecheck`, targeted test file, `pnpm build` |
| Docs-only | No tests |

Never run a full watch-mode suite. Always pass explicit file targets. CI runs the full suite.

## Generated Files

Do not edit `src/routeTree.gen.ts` or `src/data/*.gen.ts`. Update their sources and regenerate.
