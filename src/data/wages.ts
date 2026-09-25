/**
 * Curated UMP bundle — the single owned wage year for the Daya Beli tab.
 *
 * Bootstrap: rekapitulasi Kemnaker Januari 2026 di bawah PP 49/2025
 * (kompilasi media, bukan SK). Nomor SK per sel (`skRef`) masih menunjuk
 * instrumen Kepgub-nya secara generik sampai verifikasi per-SK tuntas;
 * jangan kutip kompilasi sebagai sumber di UI.
 */
export type WageRow = {
  year: number
  regionCode: string
  amountRpPerBulan: number
  skRef: string
}

/** Pinned wage year. Prices are pinned to the same year when available. */
export const UMP_YEAR = 2026

/** Last cross-check date of this bundle (ISO). Drives the staleness banner. */
export const UMP_LAST_VERIFIED = "2026-09-25"

export const UMP_SOURCE_NOTE =
  "UMP 2026 per provinsi (Rp/bulan). Bootstrap rekap Kemnaker Jan 2026, PP 49/2025; verifikasi nomor SK per provinsi belum tuntas."

const ref = (province: string): string => `Kepgub ${province} tentang UMP 2026`

/** UMP-only rows, one per province. No UMK, no aggregation. */
export const UMP_2026: WageRow[] = [
  { year: 2026, regionCode: "11", amountRpPerBulan: 3932552, skRef: ref("Aceh") },
  { year: 2026, regionCode: "12", amountRpPerBulan: 3228949, skRef: ref("Sumatera Utara") },
  { year: 2026, regionCode: "13", amountRpPerBulan: 3182955, skRef: ref("Sumatera Barat") },
  { year: 2026, regionCode: "14", amountRpPerBulan: 3780495, skRef: ref("Riau") },
  { year: 2026, regionCode: "15", amountRpPerBulan: 3471497, skRef: ref("Jambi") },
  { year: 2026, regionCode: "16", amountRpPerBulan: 3942963, skRef: ref("Sumatera Selatan") },
  { year: 2026, regionCode: "17", amountRpPerBulan: 2827250, skRef: ref("Bengkulu") },
  { year: 2026, regionCode: "18", amountRpPerBulan: 3047734, skRef: ref("Lampung") },
  { year: 2026, regionCode: "19", amountRpPerBulan: 4035000, skRef: ref("Kepulauan Bangka Belitung") },
  { year: 2026, regionCode: "21", amountRpPerBulan: 3879520, skRef: ref("Kepulauan Riau") },
  { year: 2026, regionCode: "31", amountRpPerBulan: 5729876, skRef: ref("DKI Jakarta") },
  { year: 2026, regionCode: "32", amountRpPerBulan: 2317601, skRef: ref("Jawa Barat") },
  { year: 2026, regionCode: "33", amountRpPerBulan: 2327386, skRef: ref("Jawa Tengah") },
  { year: 2026, regionCode: "34", amountRpPerBulan: 2417495, skRef: ref("DI Yogyakarta") },
  { year: 2026, regionCode: "35", amountRpPerBulan: 2446880, skRef: ref("Jawa Timur") },
  { year: 2026, regionCode: "36", amountRpPerBulan: 3100881, skRef: ref("Banten") },
  { year: 2026, regionCode: "51", amountRpPerBulan: 3207459, skRef: ref("Bali") },
  { year: 2026, regionCode: "52", amountRpPerBulan: 2673861, skRef: ref("Nusa Tenggara Barat") },
  { year: 2026, regionCode: "53", amountRpPerBulan: 2455898, skRef: ref("Nusa Tenggara Timur") },
  { year: 2026, regionCode: "61", amountRpPerBulan: 3054552, skRef: ref("Kalimantan Barat") },
  { year: 2026, regionCode: "62", amountRpPerBulan: 3686138, skRef: ref("Kalimantan Tengah") },
  { year: 2026, regionCode: "63", amountRpPerBulan: 3725000, skRef: ref("Kalimantan Selatan") },
  { year: 2026, regionCode: "64", amountRpPerBulan: 3762431, skRef: ref("Kalimantan Timur") },
  { year: 2026, regionCode: "65", amountRpPerBulan: 3775243, skRef: ref("Kalimantan Utara") },
  { year: 2026, regionCode: "71", amountRpPerBulan: 4002630, skRef: ref("Sulawesi Utara") },
  { year: 2026, regionCode: "72", amountRpPerBulan: 3179565, skRef: ref("Sulawesi Tengah") },
  { year: 2026, regionCode: "73", amountRpPerBulan: 3921088, skRef: ref("Sulawesi Selatan") },
  { year: 2026, regionCode: "74", amountRpPerBulan: 3306496, skRef: ref("Sulawesi Tenggara") },
  { year: 2026, regionCode: "75", amountRpPerBulan: 3405144, skRef: ref("Gorontalo") },
  { year: 2026, regionCode: "76", amountRpPerBulan: 3315934, skRef: ref("Sulawesi Barat") },
  { year: 2026, regionCode: "81", amountRpPerBulan: 3334490, skRef: ref("Maluku") },
  { year: 2026, regionCode: "82", amountRpPerBulan: 3510240, skRef: ref("Maluku Utara") },
  { year: 2026, regionCode: "91", amountRpPerBulan: 4436283, skRef: ref("Papua") },
  { year: 2026, regionCode: "92", amountRpPerBulan: 3841000, skRef: ref("Papua Barat") },
  { year: 2026, regionCode: "93", amountRpPerBulan: 4508100, skRef: ref("Papua Selatan") },
  { year: 2026, regionCode: "94", amountRpPerBulan: 4285848, skRef: ref("Papua Tengah") },
  { year: 2026, regionCode: "95", amountRpPerBulan: 4508714, skRef: ref("Papua Pegunungan") },
  { year: 2026, regionCode: "96", amountRpPerBulan: 3766000, skRef: ref("Papua Barat Daya") },
]
