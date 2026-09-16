# CONTEXT.md — Monitor Pangan

Glossary. No implementation details.

- **harga**: average retail (eceran) price of one commodity in one province,
  in rupiah per kilogram — except cooking oil, which is rupiah per liter.
- **komoditas (grup)**: one of the 10 strategic food groups tracked
  (beras, bawang merah, bawang putih, cabai merah, cabai rawit,
  daging ayam ras, daging sapi, telur ayam ras, gula pasir, minyak goreng).
- **varian**: a PIHPS sub-type inside a group
  (e.g. beras has Bawah I/II, Medium I/II, Super I/II — 21 varian total).
- **provinsi**: one of the 38 Indonesian provinces (post-2022 expansion),
  identified by Kemendagri region code (`REGION_CODE`, e.g. `"32"` Jawa Barat).
- **rata-rata nasional**: mean of all provincial harga for one commodity
  on one date; map colors are relative to it, never absolute thresholds.
- **hari perdagangan**: Monday–Friday, the only days PIHPS surveys prices.
  Weekends and holidays show the last trading day, labeled as such.
- **data contoh**: clearly-labeled placeholder numbers used while the real
  pipeline does not exist yet. Never presented as official data.
