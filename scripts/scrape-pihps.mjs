import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

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

function isTradingDay(iso) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function eachDay(start, end) {
  const out = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cur <= stop) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function scrapeOneDate(iso) {
  const [y, m, d] = iso.split("-");
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
    console.log(`${iso} ${s.bi || "nasional"}: ${Object.values(found).filter((v) => v != null).length}/10 grup`);
    await sleep(300);
  }
  await mkdir("data/raw", { recursive: true });
  await writeFile(`data/raw/pihps-${iso}.json`, JSON.stringify(out, null, 2));
  console.log(`wrote data/raw/pihps-${iso}.json scopes=${out.rows.length}`);
  const liveCells = out.rows.reduce(
    (n, r) => n + Object.values(r.prices).filter((v) => v != null).length,
    0,
  );
  return { iso, scopes: out.rows.length, liveCells, fetchedAt: out.fetchedAt };
}

const rawArgs = process.argv.slice(2).filter((a) => a !== "--force");
const force = process.argv.includes("--force");
const dateArgs = rawArgs.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const yearArg = rawArgs.find((a) => /^\d{4}$/.test(a));
const today = new Date().toISOString().slice(0, 10);

let startArg;
let endArg;
let manifestPath = null;
if (yearArg != null) {
  startArg = `${yearArg}-01-01`;
  endArg = yearArg === today.slice(0, 4) ? today : `${yearArg}-12-31`;
  manifestPath = `data/raw/manifest-${yearArg}.json`;
} else {
  startArg = dateArgs[0] ?? today;
  endArg = dateArgs[1] ?? startArg;
}
const ordered = [startArg, endArg].sort();
const dates = eachDay(ordered[0], ordered[1]).filter(isTradingDay);

if (dates.length === 0) {
  console.log(`no trading days in ${ordered[0]}..${ordered[1]}`);
  process.exit(0);
}

let manifest = null;
if (manifestPath != null) {
  await mkdir("data/raw", { recursive: true });
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    manifest = { year: yearArg, startedAt: new Date().toISOString(), dates: {} };
  }
  manifest.updatedAt = new Date().toISOString();
}

for (const iso of dates) {
  if (!force && existsSync(`data/raw/pihps-${iso}.json`)) {
    console.log(`skip ${iso}: data/raw/pihps-${iso}.json exists (use --force to re-scrape)`);
    if (manifest != null && manifest.dates[iso] == null) {
      manifest.dates[iso] = { skipped: true };
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }
    continue;
  }
  const summary = await scrapeOneDate(iso);
  if (manifest != null) {
    manifest.dates[iso] = summary;
    manifest.updatedAt = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

if (manifest != null) {
  const done = Object.values(manifest.dates).filter((d) => d.liveCells != null);
  const live = done.reduce((n, d) => n + d.liveCells, 0);
  console.log(`year ${manifest.year}: dates=${done.length} liveCells=${live} manifest=${manifestPath}`);
}
