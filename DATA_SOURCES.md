# DATA_SOURCES.md — Monitor Pangan provenance

Non-official mirror for development. Numbers are shown as sample data until a
sanctioned feed lands. Official sources:

- Panel Harga Pangan, Badan Pangan Nasional — https://panelharga.badanpangan.go.id/
- NFA Web API docs / registration — https://webapi.badanpangan.go.id/documentasi
- Open Data Pangan — https://data.badanpangan.go.id/
- PIHPS Bank Indonesia FAQ — https://www.bi.go.id/hargapangan/Informasi/FAQ

## What the scrapers do (2026-09-16)

`npm run ingest` runs two public, keyless scrapers — the same calls the public
sites make — rate-limited one-shot, cached to `data/raw/`:

**PIHPS BI (live daily prices, primary)** — `scripts/scrape-pihps.mjs [YYYY-MM-DD]`
- `GET /hargapangan/WebSite/TabelHarga/GetGridDataDaerah` with
  `price_type_id=1` (pasar tradisional = eceran), `tipe_laporan=1` (harian),
  per province. No key, no login.
- 2026-09-16: 310/380 rows live (national + 31 provinces x 10 grup).
  Empty from source: Kepri, Kalbar, Kaltara (`{"data":[]}`) and the 4
  post-2022 Papua provinces PIHPS does not survey yet — those cells fall back
  to clearly-mixed sample values until covered.

**Panel Harga catalog (metadata)** — `scripts/scrape-panelharga.mjs`

- `provinces?search=` — 38 provinces (IDs match Kemendagri `REGION_CODE`)
- `cms/eceran` — 27 eceran (konsumen, `level_harga_id=3`) commodities with units
- `cms/produsen` — 18 produsen commodities
- `cms/config/keterangan?level_harga_id=3` — HET/HAP footnotes

Daily per-province price endpoints (`front/harga-pangan-table`,
`front/harga-peta-provinsi`, `front/table-rekapitulasi`) return
`401 Unauthorized` — the embedded `x-api-key` in the public bundle is rotated
server-side. The scraper records the 401 and continues; no credential bypass.

## Going live (manual parallel track)

1. Register at https://webapi.badanpangan.go.id/register (needs
   Nama/Email/No.Telp/Lembaga/Dokumen), wait for Pusdatin approval, copy the
   `X-Authorization` key. Daily cron filters `level=eceran` for consumer prices.
2. Or download the monthly "Rata-rata Harga Pangan Bulanan Tingkat Konsumen
   Provinsi" CSV from Open Data (survey form + SAPA gated) into
   `data/raw/manual-*.csv`, then `npm run normalize`.
3. When either lands, `data/snapshots/latest.json` carries real prices and the
   header badge flips from `Data contoh` to `Data <date> · Panel Harga eceran`
   with zero UI changes.

## Semantics (PIHPS FAQ)

Eceran traditional-market survey, Mon–Fri 09:00–11:00 WIB, published ~13:00.
Province price = mean of surveyed kab/kota; national = mean of all.
Units Rp/kg except cooking oil Rp/liter. Weekend/holiday UIs show the last
trading day labeled as such.
