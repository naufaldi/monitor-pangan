import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SERIES_REGIONS, yearSeriesDocument } from "./daily-series.mjs";

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
    if (res.ok) {
      const body = await res.json();
      return { ok: true, data: body.data ?? [] };
    }
    console.error(`retry ${attempt}/${retries} HTTP ${res.status} ${url.searchParams}`);
    await sleep(1500 * attempt);
  }
  return { ok: false, data: [] };
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

function isoFromColumn(column) {
  const [day, month, year] = column.split("/");
  return `${year}-${month}-${day}`;
}

function levelPrices(rows) {
  const byColumn = new Map();
  for (const row of rows) {
    if (row.level !== 1) continue;
    const grup = CAT_TO_GRUP[row.name];
    if (grup == null) continue;
    for (const [key, value] of Object.entries(row)) {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(key)) continue;
      const iso = isoFromColumn(key);
      let prices = byColumn.get(iso);
      if (prices == null) {
        prices = {};
        byColumn.set(iso, prices);
      }
      prices[grup] = toNum(value);
    }
  }
  return Object.fromEntries(byColumn);
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const width = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}

async function scrapeYear(year) {
  const today = new Date().toISOString().slice(0, 10);
  const start = `${year}-01-01`;
  const end = year === today.slice(0, 4) ? today : `${year}-12-31`;
  const scopeDir = `data/raw/year-scopes/${year}`;
  await mkdir(scopeDir, { recursive: true });
  await mkdir("public/series", { recursive: true });
  const scopes = [{ bi: "", kemendagri: null, id: "nasional" }];
  for (const [bi, kem] of Object.entries(BI_TO_KEMENDAGRI)) {
    scopes.push({ bi, kemendagri: kem, id: bi });
  }
  await mapPool(scopes, 4, async (scope) => {
    const cachePath = `${scopeDir}/${scope.id}.json`;
    if (!force && existsSync(cachePath)) {
      console.log(`skip ${year} scope ${scope.id}: cached`);
      return;
    }
    const params = {
      price_type_id: "1",
      tipe_laporan: "1",
      start_date: start,
      end_date: end,
      ...(scope.bi ? { province_id: scope.bi } : {}),
    };
    const json = await grid(params);
    if (!json.ok) {
      console.error(`year ${year} scope ${scope.id}: request failed`);
      return;
    }
    const prices = levelPrices(json.data);
    await writeFile(cachePath, JSON.stringify(prices));
    console.log(`year ${year} scope ${scope.id}: ${Object.keys(prices).length} days`);
  });
  const byDate = new Map();
  for (const scope of scopes) {
    const cachePath = `${scopeDir}/${scope.id}.json`;
    if (!existsSync(cachePath)) continue;
    const pricesByDate = JSON.parse(await readFile(cachePath, "utf8"));
    for (const [iso, prices] of Object.entries(pricesByDate)) {
      let rows = byDate.get(iso);
      if (rows == null) {
        rows = [];
        byDate.set(iso, rows);
      }
      rows.push({
        province_id: scope.bi || "nasional",
        region_code: scope.kemendagri,
        prices,
      });
    }
  }
  const dates = [...byDate.keys()].sort();
  await mkdir("data/raw", { recursive: true });
  for (const iso of dates) {
    const payload = {
      fetchedAt: new Date().toISOString(),
      date: iso,
      source: "pihps",
      rows: byDate.get(iso),
    };
    await writeFile(`data/raw/pihps-${iso}.json`, JSON.stringify(payload));
  }
  const priceAt = (iso, grup, code) => {
    const rows = byDate.get(iso) ?? [];
    const row = rows.find((entry) => entry.region_code === code);
    return row?.prices?.[grup] ?? null;
  };
  const document = yearSeriesDocument(year, dates, priceAt, SERIES_REGIONS);
  await writeFile(`public/series/${year}.json`, JSON.stringify(document));
  console.log(`year ${year}: days=${dates.length} series=public/series/${year}.json`);
}

const rawArgs = process.argv.slice(2).filter((a) => a !== "--force");
const force = process.argv.includes("--force");
const dateArgs = rawArgs.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const yearArgs = rawArgs.filter((a) => /^\d{4}$/.test(a));
const today = new Date().toISOString().slice(0, 10);

if (yearArgs.length > 0) {
  for (const year of yearArgs) await scrapeYear(year);
  process.exit(0);
}

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
