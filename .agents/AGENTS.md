# AGENTS.md — Monitor Pangan

This is the Monitor Pangan repo. Base branch is `main`. Use `pnpm` from the repo root.

## Stack

TanStack Start + TanStack Router + React 19 + Vite 8 + Tailwind 4 + Leaflet, Cloudflare D1 (`db/schema.sql`) via Wrangler. TypeScript 5.8, ESM (`type: module`), `strict: true`.

## Layout

- `src/routes/` — file routes (`__root.tsx`, `index.tsx`, `tren.tsx`)
- `src/components/` — map, table, chart, navbar
- `src/data/provider.ts` — `PriceDataProvider` contract UI renders against
- `src/data/*.gen.ts`, `src/routeTree.gen.ts` — generated, do not edit
- `scripts/*.mjs` — PIHPS / Panel Harga scrape, normalize, seed
- `db/schema.sql`, `data/snapshots/latest.json`, `DATA_SOURCES.md`
- Domain glossary: `CONTEXT.md`. Never present `Data contoh` as official data.

## Commands

```sh
pnpm install
pnpm typecheck   # tsc --noEmit, required gate
pnpm build       # tsr generate && vite build, required gate
pnpm dev --port 3001
```

No test or lint runner yet. `pnpm typecheck` + `pnpm build` are the gates. Report commands you could not run.

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
