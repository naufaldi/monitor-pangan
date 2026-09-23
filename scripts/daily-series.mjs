export const SERIES_GRUPS = [
  "beras",
  "bawang-merah",
  "bawang-putih",
  "cabai-merah",
  "cabai-rawit",
  "daging-ayam",
  "daging-sapi",
  "telur-ayam",
  "gula-pasir",
  "minyak-goreng",
];

export const SERIES_REGIONS = [
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "21",
  "31", "32", "33", "34", "35", "36",
  "51", "52", "53",
  "61", "62", "63", "64", "65",
  "71", "72", "73", "74", "75", "76",
  "81", "82",
  "91", "92", "93", "94", "95", "96",
];

/** Nearest rupiah. Empty input has no mean. */
export function meanRupiah(prices) {
  const nums = prices.filter((price) => price != null);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((sum, price) => sum + price, 0) / nums.length);
}

/**
 * Slim year file the chart fetches. `priceAt(date, grup, region)` returns the
 * provincial harga or null when that province was tidak disurvei.
 */
export function yearSeriesDocument(year, dates, priceAt, regions = SERIES_REGIONS) {
  const values = {};
  for (const grup of SERIES_GRUPS) {
    values[grup] = {};
    for (const code of regions) {
      values[grup][code] = dates.map((date) => priceAt(date, grup, code));
    }
    values[grup].nasional = dates.map((date) =>
      meanRupiah(regions.map((code) => priceAt(date, grup, code))),
    );
  }
  return { year, dates, values };
}
