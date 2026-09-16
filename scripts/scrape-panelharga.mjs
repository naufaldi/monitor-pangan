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
  const res = await fetch(`${API_BASE}/${path}`, { headers: HEADERS });
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
