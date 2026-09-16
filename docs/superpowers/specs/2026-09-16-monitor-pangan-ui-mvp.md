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
