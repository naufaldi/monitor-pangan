# Monitor Pangan

Peta dan tabel harga pangan strategis Indonesia per provinsi.

## Status

UI MVP — map + table over clearly-labeled mock data (`Data contoh`).
Real pipeline (PIHPS scraper + Bapanas API) lands in the data phase
behind the same `PriceDataProvider` interface.

## Develop

```sh
npm install
npm run dev      # http://localhost:3001
npm run typecheck
npm run build
```

## Docs

- `CONTEXT.md` — domain glossary
- `docs/superpowers/specs/2026-09-16-monitor-pangan-design.md` — V1 spec
- `docs/superpowers/specs/2026-09-16-monitor-pangan-ui-mvp.md` — UI MVP note

Map: `indonesia-geodata` (MIT). Tiles: OpenStreetMap contributors.
Numbers on this page are mock data until the pipeline lands — official
sources: Panel Harga Bapanas, PIHPS Bank Indonesia.
