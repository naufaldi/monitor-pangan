# CONTEXT.md — Monitor Pangan

Glossary. No implementation details.

- **harga**: average retail (eceran) price of one commodity in one province,
  in rupiah per kilogram — except cooking oil, which is rupiah per liter.
- **komoditas (grup)**: one of the 10 strategic food groups tracked
  (beras, bawang merah, bawang putih, cabai merah, cabai rawit,
  daging ayam ras, daging sapi, telur ayam ras, gula pasir, minyak goreng).
- **varian**: a PIHPS sub-type inside a group
  (e.g. beras has Bawah I/II, Medium I/II, Super I/II — 21 varian total).
  The published series is the group, not the varian.
- **provinsi**: one of the 38 Indonesian provinces (post-2022 expansion),
  identified by Kemendagri region code (`REGION_CODE`, e.g. `"32"` Jawa Barat).
- **tidak disurvei**: a province with no PIHPS harga on that hari perdagangan.
  It has no number and is left out of that day's rata-rata nasional.
- **rata-rata nasional**: the mean, to the nearest rupiah, of provincial harga
  that exist for one commodity on one hari perdagangan. Map colors are relative
  to it, never absolute thresholds.
- **perubahan harian**: the percent change from the previous hari perdagangan
  that has a harga. For the national figure, only provinces present on both
  days. When that overlap is smaller than the day's surveyed set, the count is
  part of the figure.
- **perubahan tahunan**: the percent change from the same calendar date a year
  earlier, or from the latest hari perdagangan on or before that date. The
  national figure uses the same overlap rule. There is no percent when the
  anchor day has no harga.
- **hari perdagangan**: Monday–Friday, the only days PIHPS surveys prices.
  Weekends and holidays show the last trading day, labeled as such.
- **UMP**: the provincial minimum wage in force for a calendar year.
  _Avoid_: UMR
- **daya beli**: how much of one commodity one month of that province's UMP
  buys on one hari perdagangan — UMP divided by that day's harga. Kilograms,
  or liters for minyak goreng. It is per province. A province that is tidak
  disurvei has none. There is no national daya beli.
- **data contoh**: clearly-labeled placeholder numbers used while the real
  pipeline does not exist yet. Never presented as official data.
