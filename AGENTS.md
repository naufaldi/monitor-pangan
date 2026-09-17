# AGENTS.md — monitor-pangan

## Commands

- `npm install` — install the npm workspaces monorepo.
- `npm run dev` — start the web app on http://localhost:3001.
- `npm run typecheck` — strict TypeScript check, must pass before review.
- `npm run build` — route generation plus production build.

## Monorepo layout

- `packages/ui/` is the single shared frontend package (`@monitor-pangan/ui`).
- The app lives at the repo root (`src/`). Root `package.json` declares `workspaces: ["packages/*"]` and depends on `@monitor-pangan/ui` via `workspace:*`.
- `tsconfig.json` maps `@monitor-pangan/ui` to `./packages/ui/src/index.ts` and `#/*` to `./src/*`.
- Do not create a second button, card, badge, input, or select implementation in the app.

## Frontend UI system

Single source of truth is `packages/ui/`.

- `packages/ui/src/tokens.css` owns all design tokens (`:root` plus Tailwind v4 `@theme inline`). `src/styles.css` imports it and adds only base layers and Leaflet overrides.
- `packages/ui/src/primitives.tsx` owns `Button`, `Card`, `Badge`, `Input`, `Select` plus the `buttonClass`, `cardClass`, `badgeClass`, `inputClass`, `selectClass` helpers and `cn`.
- `packages/ui/src/index.ts` is the only public entrypoint. Import from `@monitor-pangan/ui`, never by relative path into `packages/`.

Rules:

- Use `Button` with `variant="pill" | "rect"` and `active` for toggles, steppers, and date or timeframe pickers. `Button`, `Input`, and `Select` all forward `ref`. Use `buttonClass` on the same shape when the host element cannot be a `<button>` (a `<span>` inside a router `Link`).
- Use `Card` for plain `<div>` shells. Use `cardClass(padding)` on semantic hosts (`section`, `aside`, `figure`) to keep landmarks. Padding is `none | md (p-4) | lg (p-5)`. Add `overflow-hidden` through the second argument when content must clip (map, table, dropdown panel).
- Use `Badge` with `tone="ember" | "neutral"` for header status and change pills. Override text color through `className` when the tone needs it (province panel down state uses `text-leaf-deep`).
- Use `Input` and `Select` for search, text, and dropdown controls. They render `bg-paper` with `border-input`. Do not reintroduce `bg-background` on controls. The select-with-affordance pattern is a relative wrapper plus `appearance-none` plus `pr-11` plus `ChevronBadge` (`src/components/ChevronBadge.tsx`). The native date input in `src/components/DatePicker.tsx` stays native.
- Commodity picking uses the grouped `CommoditySelect` combobox, not a tab strip. Do not reintroduce per-commodity tab buttons.
- Use tokens (`bg-paper`, `bg-canvas`, `text-ink`, `text-slate`, `border-hairline`, `bg-ember-soft`, `text-ember`, `text-leaf-deep`, `bg-muted`) for chrome. Do not hardcode hex for chrome.
- The map price scale in `src/components/MapView.tsx` (`STOPS`) and the SVG fills in `src/components/TrendChart.tsx` are data visualization, not chrome. Keep the scale together in one table. Reuse token hex values (`#00714c`, `#00bd7d`, `#dc2626`, `#fef2f2`, `#5c6358`) where the scale touches them.
- State shape first: UI state is `variant` plus `active` plus standard element props. Do not add per-file `cn()` branches that duplicate a primitive variant.

## App conventions

- Routes: `src/routes/__root.tsx` owns the header and `Navbar`. `src/routes/index.tsx` owns map plus table. `src/routes/tren.tsx` owns trends plus movers.
- Components in `src/components/` are presentational and driven by props from `src/data/provider.ts` (`PriceDataProvider`). Numbers are sample data until the pipeline lands and must stay behind the existing badges.
- Formatting lives in `src/lib/format.ts`. Merging classes outside `packages/ui` uses `cn` from `#/lib/utils.ts`.
- `src/routes/tren.tsx` keeps the exhaustive `switch` with a `never` default for direction labels.
