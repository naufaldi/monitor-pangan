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
  Source-empty that day: Kepri, Kalbar, Kaltara (`{"data":[]}` — intermittent,
  they usually serve data) plus the 4 post-2022 Papua provinces (93–96:
  Papua Selatan/Tengah/Pegunungan/Barat Daya) PIHPS never surveys — no BI
  `province_id` exists for them. Live snapshots leave those cells empty
  (no mock fill); `nationalAvg` averages only real PIHPS prices.
- History depth (verified 2026-09-17): earliest served date is 2017-03-27.
  2014 through mid-March 2017 return `{"data":[]}`. Format is stable across
  years: same ten `level == 1` categories, same `d/m/yyyy` column header.
- Full backfill (completed 2026-09-17): 2,474/2,474 trading days from
  2017-03-27 through 2026-09-17 scraped — ~791.7k live provincial cells in
  `data/raw/pihps-*.json` (git-ignored; coverage travels via the derived
  snapshots plus `src/data/*.gen.ts`). 24 dates are source-empty, all
  accounted for: national holidays (Nyepi, Idul Fitri/Adha blocks, Natal,
  Tahun Baru, Pancasila, Pilkada, cuti bersama) plus 2026-09-17, not yet
  published at scrape time (~13:00 WIB release). Mar–Jul 2017 is a partial
  rollout ramp (national + few provinces); from ~Jul 2017 onward a normal
  date is 350/350 (national + all 34 surveyed provinces), with sporadic
  single-province source gaps (~8% of dates per province, spread evenly).
  One full 35-scope date takes about 21s (~14h sequential for the whole
  range), so it was run as 6 parallel disjoint date-range jobs
  (`node scripts/scrape-pihps.mjs <from-YYYY-MM-DD> <to-YYYY-MM-DD>`,
  skip-existing so every chunk is resumable) with zero HTTP retries —
  no rate-limit pressure observed. Year manifests
  (`data/raw/manifest-<YYYY>.json`) are rebuilt after range scrapes with
  `npm run manifests` (`scripts/build-manifests.mjs`, same schema as the
  single-year mode, which stays race-free by writing no manifest).
- Panel catalog API (`api-panelhargav2.badanpangan.go.id`) times out from some
  networks. When it does, `scripts/scrape-panelharga.mjs` synthesizes
  `provinces` (in-repo 38-province list) and `cms_eceran` (join-relevant ids)
  into `data/raw/panelharga-*.json` with a `catalogSynthesized` provenance
  flag instead of failing the pipeline. The join only needs `national_id`
  values plus eceran commodity ids, so prices are unaffected.

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

## Laporan harga warga

Citizen reports live in `laporan_warga` and the R2 bucket
`monitor-pangan-laporan`. They never enter `prices_daily`, the PIHPS map,
Grafik, or Daya Beli.

Secrets stay out of the repo. Set them with Wrangler, each value at least 32
random bytes where noted:

```sh
wrangler secret put ADMIN_SECRET
wrangler secret put TURNSTILE_SECRET
wrangler secret put TURNSTILE_SITE_KEY
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

`ADMIN_SECRET` must be at least 32 bytes. `R2_BUCKET_NAME` is the non-secret
var `monitor-pangan-laporan` in `wrangler.toml`. Local values belong in
`.dev.vars`, which is gitignored.

Photos land at `pending/<id>.jpg` and move to `decided/<id>.jpg` when a report
is approved or rejected. One lifecycle rule, in `r2-lifecycle.json`, deletes
objects under `decided/` 30 days after upload (2,592,000 seconds). Pending
objects are not auto-deleted. There is no retention cron. Apply the rule
yourself when the bucket exists; this change does not run it:

```sh
wrangler r2 bucket lifecycle set monitor-pangan-laporan --file r2-lifecycle.json
```

The browser PUTs the JPEG to R2, so the bucket also needs a CORS rule that
allows `PUT` with `content-type` from `https://monitor.naufaldi.com`.
`r2-cors.json` is that rule. Apply it yourself; this change does not run it:

```sh
wrangler r2 bucket cors set monitor-pangan-laporan --file r2-cors.json
```

A Free WAF rate limit on `POST /api/laporan` (per IP, 10 seconds, Block) is
dashboard-only and is not applied here.
