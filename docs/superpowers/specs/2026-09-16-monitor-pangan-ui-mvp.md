# Monitor Pangan — UI MVP note (2026-09-16)

Companion to the [V1 design spec](./2026-09-16-monitor-pangan-design.md).
Scope for this phase is UI-first: the two user stories below, nothing else.

## Stories

1. User sees pangan data easily on a map — province choropleth colored
   by price vs national average, click a province for side-panel detail.
2. User sees pangan data in a table — 38 provinces, sortable by price,
   searchable by name, row click syncs with the map.

## Grilled decisions

- Mock fixture + `PriceDataProvider` interface (`src/data/provider.ts`);
  the real Effect + D1 pipeline implements the same interface later.
- Leaflet + `indonesia-geodata` `indonesiaLow` (~50KB, MIT),
  joined on `REGION_CODE`. MapLibre deferred — no payoff at 38 polygons.
- Single TanStack Start app; monorepo split lands with the data phase.
- Date picker works over 3 mock trading-day snapshots, always badged
  data-contoh. No fake-data trust risk beyond the badge.
- All 10 commodity groups day 1; mock rows make breadth cheap.
- `ssr: false` on the index route (Leaflet needs `window`).

## Explicitly out

Auth, `/api/*`, cron, CSV export, cost calculator, alerts, E2E tests.
No ADRs: scaffold shape, Leaflet, and mock-provider are all easily
reversible, so none clear the ADR bar.

## UI consistency rules

The original MVP scope above records the September scaffold. The later
[UI audit, #31](https://github.com/naufaldi/monitor-pangan/issues/31), covers
the current map, trends, purchasing power, citizen reports and admin views.

Build these views from `@monitor-pangan/ui`. Keep data fetching, route search,
report moderation and other application behavior in `src/`.

| Need | Shared component or helper |
| --- | --- |
| Native select and file upload | `FieldSelect`, `FileInput` |
| Mutually exclusive toggle | `SegmentedControl` |
| Searchable picker | `ListboxSearch`, `Listbox`, `ListboxGroup`, `ListboxOption`, `ListboxEmpty` |
| Search, panel and figures | `SearchInput`, `Panel`, `StatList`, `Stat` |
| Page structure | `PageShell`, `StickyToolbar`, `PageHeader`, `SectionHeader` |
| Table cells | `tableClass`, `thClass`, `tdClass` |
| Navigation and selection | `navPillClass`, `selectedRowClass` |
| Empty, loading and error feedback | `StatusMessage` |
| Price changes and direction | `Delta`, `directionGlyph` |
| SVG and Leaflet colors | `color` |

Fields use a 44px height floor, a 10px radius, the hairline border token and
the shared keyboard focus ring. Cards retain their larger radius. Navigation
links own their visible pill and scroll horizontally on narrow screens.

Selection uses the neutral selected token. Active toggles use ink. Primary
actions use the leaf-deep primary variant. Ember warns about sample data and
represents upward price changes; official PIHPS date badges are neutral.
Leaf, gold and heat retain their data meanings.

Percentages use Indonesian formatting, such as `+44,7%`. Direction glyphs are
`▲` for up, `▼` for down and `•` for flat. Loading must not appear as a
confirmed empty result.

Page titles are visible on report and admin pages. Map, trends and purchasing
power retain a screen-reader heading without moving their toolbar down.
Sticky toolbars use the shared z-index token.

Verify layouts at 1280px and 390px. Prices stay on one line inside scrollable
tables. Chart axis labels remain at least 11 CSS pixels on the narrow viewport.
Audit citizen reports and admin against a local Worker with seeded data;
Vite alone does not serve those APIs.
