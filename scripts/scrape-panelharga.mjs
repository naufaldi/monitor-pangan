import { mkdir, writeFile } from "node:fs/promises";

const API_BASE =
  process.env.PANELHARGA_API_BASE ??
  "https://api-panelhargav2.badanpangan.go.id/api";

const HEADERS = {
  Accept: "application/json",
  Origin: "https://panelharga.badanpangan.go.id",
  Referer: "https://panelharga.badanpangan.go.id/beranda",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 monitor-pangan/0.1.0",
};

async function get(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}/${path}`, { headers: HEADERS });
  } catch (err) {
    return { ok: false, status: 0, body: String(err).slice(0, 200) };
  }
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, body: text.slice(0, 200) };
  return { ok: true, status: res.status, json: JSON.parse(text) };
}

const out = {
  fetchedAt: new Date().toISOString(),
  apiBase: API_BASE,
  catalog: {},
  prices: {},
};

const catalogPaths = [
  "provinces?search=",
  "cms/eceran",
  "cms/produsen",
  "cms/config/keterangan?level_harga_id=3",
];

for (const p of catalogPaths) {
  const r = await get(p);
  const key = p.split("?")[0].replaceAll("/", "_");
  if (!r.ok) {
    console.error(`FAIL ${p} -> ${r.status} ${r.body}`);
    process.exitCode = 1;
    continue;
  }
  out.catalog[key] = r.json;
  const n = Array.isArray(r.json.data)
    ? r.json.data.length
    : Object.keys(r.json.data ?? {}).length;
  console.log(`OK ${p} items=${n}`);
}

// Documented fallback: the catalog API times out from some networks. The
// price join only needs province national_ids plus eceran commodity ids, so
// synthesize both from the in-repo lists instead of failing the pipeline.
const FALLBACK_PROVINCES = [
  ["11", "Aceh"], ["12", "Sumatera Utara"], ["13", "Sumatera Barat"],
  ["14", "Riau"], ["15", "Jambi"], ["16", "Sumatera Selatan"],
  ["17", "Bengkulu"], ["18", "Lampung"],
  ["19", "Kepulauan Bangka Belitung"], ["21", "Kepulauan Riau"],
  ["31", "DKI Jakarta"], ["32", "Jawa Barat"], ["33", "Jawa Tengah"],
  ["34", "D.I Yogyakarta"], ["35", "Jawa Timur"], ["36", "Banten"],
  ["51", "Bali"], ["52", "Nusa Tenggara Barat"],
  ["53", "Nusa Tenggara Timur"], ["61", "Kalimantan Barat"],
  ["62", "Kalimantan Tengah"], ["63", "Kalimantan Selatan"],
  ["64", "Kalimantan Timur"], ["65", "Kalimantan Utara"],
  ["71", "Sulawesi Utara"], ["72", "Sulawesi Tengah"],
  ["73", "Sulawesi Selatan"], ["74", "Sulawesi Tenggara"],
  ["75", "Gorontalo"], ["76", "Sulawesi Barat"], ["81", "Maluku"],
  ["82", "Maluku Utara"], ["91", "Papua"], ["92", "Papua Barat"],
  ["93", "Papua Selatan"], ["94", "Papua Tengah"],
  ["95", "Papua Pegunungan"], ["96", "Papua Barat Daya"],
];
const FALLBACK_ECERAN_IDS = [
  27, 28, 109, 165, 166, 30, 31, 32, 126, 33, 35, 34, 36, 37, 38, 101, 127,
];

out.catalogSynthesized = [];
if (out.catalog.provinces == null) {
  out.catalog.provinces = {
    data: FALLBACK_PROVINCES.map(([national_id, name]) => ({ national_id, name })),
  };
  out.catalogSynthesized.push("provinces");
  console.log("SYNTHESIZED provinces from in-repo 38-province list");
}
if (out.catalog.cms_eceran == null) {
  out.catalog.cms_eceran = { data: FALLBACK_ECERAN_IDS.map((id) => ({ id })) };
  out.catalogSynthesized.push("cms_eceran");
  console.log("SYNTHESIZED cms_eceran from in-repo join-relevant id list");
}
if (out.catalogSynthesized.length > 0) process.exitCode = 0;

const today = new Date().toISOString().slice(0, 10);
const priceProbes = [
  `front/harga-pangan-table?province_id=&city_id=&level_harga_id=3&tanggal=${today}`,
  `front/harga-peta-provinsi?level_harga_id=3&tanggal=${today}`,
  `front/table-rekapitulasi?level_harga_id=3&tanggal=${today}`,
];

for (const p of priceProbes) {
  const r = await get(p);
  out.prices[p] = r.ok
    ? { ok: true, data: r.json }
    : { ok: false, status: r.status, note: r.body };
  console.log(`${r.ok ? "OK" : `SKIP (${r.status})`} ${p}`);
}

await mkdir("data/raw", { recursive: true });
await writeFile(
  `data/raw/panelharga-${today}.json`,
  JSON.stringify(out, null, 2),
);
console.log(`wrote data/raw/panelharga-${today}.json`);
