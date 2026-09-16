import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://www.bi.go.id";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 monitor-pangan/0.1.0",
  Referer: `${BASE}/hargapangan/TabelHarga/PasarTradisionalDaerah`,
  Accept: "application/json",
};

const BI_TO_KEMENDAGRI = {
  1: "11", 2: "12", 3: "13", 4: "14", 6: "15", 8: "16", 7: "17", 10: "18",
  9: "19", 5: "21", 12: "32", 14: "33", 15: "34", 16: "35", 11: "36",
  13: "31", 20: "61", 22: "62", 21: "63", 23: "64", 24: "65", 17: "51",
  18: "52", 19: "53", 26: "73", 28: "72", 29: "71", 27: "74", 25: "75",
  30: "76", 31: "81", 32: "82", 33: "91", 34: "92",
};

const CAT_TO_GRUP = {
  Beras: "beras",
  "Bawang Merah": "bawang-merah",
  "Bawang Putih": "bawang-putih",
  "Cabai Merah": "cabai-merah",
  "Cabai Rawit": "cabai-rawit",
  "Daging Ayam": "daging-ayam",
  "Daging Sapi": "daging-sapi",
  "Telur Ayam": "telur-ayam",
  "Gula Pasir": "gula-pasir",
  "Minyak Goreng": "minyak-goreng",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toNum = (s) => {
  if (s == null || s === "" || s === "-") return null;
  const t = String(s).replaceAll(".", "");
  if (/,(\d{3})$/.test(t)) return Number(t.replace(",", ""));
  return Number(t.replace(",", "."));
};

async function grid(params, retries = 3) {
  const url = new URL(`${BASE}/hargapangan/WebSite/TabelHarga/GetGridDataDaerah`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    console.error(`retry ${attempt}/${retries} HTTP ${res.status} ${url.searchParams}`);
    await sleep(1500 * attempt);
  }
  return { data: [] };
}

const dateArg = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const [y, m, d] = dateArg.split("-");
const iso = `${y}-${m}-${d}`;
const col = `${d}/${m}/${y}`;

const out = { fetchedAt: new Date().toISOString(), date: iso, source: "pihps", rows: [] };

const scopes = [{ bi: "", kemendagri: null }];
for (const [bi, kem] of Object.entries(BI_TO_KEMENDAGRI)) scopes.push({ bi, kemendagri: kem });

for (const s of scopes) {
  const params = {
    price_type_id: "1",
    tipe_laporan: "1",
    start_date: iso,
    end_date: iso,
    ...(s.bi ? { province_id: s.bi } : {}),
  };
  const json = await grid(params);
  const found = {};
  for (const row of json.data ?? []) {
    const grup = CAT_TO_GRUP[row.name];
    if (row.level === 1 && grup) found[grup] = toNum(row[col]);
  }
  out.rows.push({ province_id: s.bi || "nasional", region_code: s.kemendagri, prices: found });
  console.log(`${s.bi || "nasional"}: ${Object.values(found).filter((v) => v != null).length}/10 grup`);
  await sleep(300);
}

await mkdir("data/raw", { recursive: true });
await writeFile(`data/raw/pihps-${iso}.json`, JSON.stringify(out, null, 2));
console.log(`wrote data/raw/pihps-${iso}.json scopes=${out.rows.length}`);
