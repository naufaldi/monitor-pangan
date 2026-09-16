# Monitor Pangan — Design Spec (2026-09-16)

## 1. Context
- Owner GitHub `naufaldi` (374 public repos): pattern of fast single-push experiments, TypeScript-heavy. Winners are Indonesia-focused real-user tools: `viralkan-app` (37 stars), `teacher-exam` (21 stars), `ai-think` (13 stars).
- Past abandonment cause (owner-confirmed): mostly experiments/learning, no filter between playground vs keeper.
- New keeper project: **Monitor Harga Pangan Indonesia** — daily strategic food prices on a national map. New repo `~/WebApps/monitor-pangan` (not evolving `garda-pangan`).
- Keeper win condition: web live + prices update themselves every day, 30 days with no manual fix.

## 2. Decisions (approved)
- **Approach A, Cloudflare-native** (hybrid VPS and static dataset-first rejected: VPS doubles babysitting burden, static depends on third-party data).
- **Stack**: TanStack Start + Effect HttpApi + Drizzle ORM + Cloudflare D1 + R2 + Workers Cron. Reuses `content-generator` patterns. TypeScript throughout.
- **V1 scope**: national map (province choropleth) + table, 10 PIHPS strategic commodity groups (beras, bawang merah, bawang putih, cabai merah besar, cabai merah keriting, cabai rawit, daging ayam ras, daging sapi, telur ayam ras, gula pasir, minyak goreng — mapped to PIHPS variants), daily refresh. YAGNI cut: no auth, no accounts, no alerts system, no cost-of-living calculator, city detail beyond table.
- **Dual-track data**: scraper+cron ships day 1 while Bapanas official API key approval runs in parallel (takes days, manual verification). Bapanas adapter ships behind feature flag, flips to primary when key lands — no migration.
- **Dynamic sources**: registry supports N future sources, not just the 2 known today.

## 3. Architecture
- Single monorepo app: TanStack Start serves web + map; Effect HttpApi implements pipeline + public API; Drizzle over D1; R2 stores raw snapshots + GeoJSON + CSV exports.
- Workers Cron daily 14:00 WIB (after PIHPS 13:00 publish) fans out to all enabled sources in parallel (30s timeout each).
- Source abstraction: `PriceSource` interface, per-source adapter file + one registry line + D1 seed. No cron/API/map changes when adding a source.
- Public surface V1: `/` map + table, `/api/prices?date=&province=&commodity=`, `/api/health`, daily CSV export from same `latest_prices` view.

## 4. Components + data model
- `sources/pihps.ts`: fetch PIHPS widget JSON (`bi.go.id/hargapangan`, reverse-engineered endpoints), parse 10 commodities x provinces, Effect Schema validation, raw saved to R2 `raw/pihps/YYYY-MM-DD.json`.
- `sources/bapanas.ts`: official Web API NFA (`webapi.badanpangan.go.id`, `X-Authorization` key, produsen/grosir/eceran levels to 514 kab/kota). Disabled until key approved.
- `sources/registry.ts`: per-source config (id, schedule, auth type, commodity map, region map, priority). Priority when overlapping: Bapanas > PIHPS > fallback dataset.
- D1 tables: `commodities(id, name, unit)`, `regions(code, name, level, geojson_ref)`, `prices_daily(date, commodity_id, region_code, level, price, source_id, raw_ref)` unique(date, commodity, region, level), `prices_rejected(...)` quarantine, `job_runs(...)` cron lock + history.
- Region seed: BPS codes + simplified Indonesia GeoJSON in R2.
- `jobs/daily-cron.ts`: run sources → validate → upsert D1 (batched 500, idempotent) → fallback CSV to R2 → health row.
- Web routes: `/` choropleth vs national average (red/green) + commodity tabs + date picker (default latest complete); `/api/prices`, `/api/health`.

## 5. Data flow
1. Cron triggers → all enabled adapters run in parallel → each writes R2 raw first.
2. Normalize via adapter's commodity/region map → Effect Schema validate → upsert D1 with source priority (loser kept with `raw_ref` for audit).
3. Row-count guard: <90% expected rows → keep yesterday, mark date incomplete, snapshot raw for post-mortem.
4. Nightly fallback: if primary yields incomplete, pull `azzandwi1/indonesian-food-prices-dataset`.
5. Serve path reads `latest_prices` view (latest complete date per commodity); incomplete today auto-falls back to previous complete date with "data kemarin" badge.

## 6. Error handling
- Scrape format change: guard + raw snapshot + `/api/health` yellow, never silently overwrite good data.
- Source timeout/down: 3x backoff retry per source → fallback chain → previous-day carry.
- Bad rows: quarantined, never block good rows.
- Cron overlap: single `job_runs` lock row; re-runs idempotent.
- Visibility V1: health badge in map footer + optional Telegram ping on 2 consecutive failures (no full alerting system).

## 7. Testing + keeper guardrails
- Unit: Effect Schema per source with fixtures incl. broken HTML; registry plug-in test with dummy source; cron idempotency (run twice, same rows); map smoke on seeded data. No browser E2E in V1.
- Scope freeze: map + table + API + CSV, 10 commodities, province level. Everything else → backlog.
- Ship trigger: first green cron + live URL within 14 days; then 30-day health streak is the win.
- Docs: README source-adding recipe (5 steps), DATA_SOURCES.md provenance + credit (Bapanas/BI), LICENSE + non-official-mirror disclaimer with source links.

## 8. Open items (pre-implementation)
1. Reverse-engineer PIHPS widget JSON endpoints (verify fetch works from Workers, no headless browser needed).
2. Register Bapanas Web API account + request key (parallel track, manual approval).
3. Confirm simplified Indonesia province GeoJSON source + license.
4. Confirm Cloudflare account + D1/R2/Workers Cron availability on chosen plan.

## 9. Next step
Invoke writing-plans skill for implementation plan. No app code until plan approved.
