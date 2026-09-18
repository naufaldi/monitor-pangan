import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const GRUP_MAP = {
  beras: ["27", "28", "109", "165", "166"],
  "bawang-merah": ["30"],
  "bawang-putih": ["31"],
  "cabai-merah": ["32", "126"],
  "cabai-rawit": ["33"],
  "daging-ayam": ["35"],
  "daging-sapi": ["34"],
  "telur-ayam": ["36"],
  "gula-pasir": ["37"],
  "minyak-goreng": ["38", "101", "127"],
};

const GRUPS = Object.keys(GRUP_MAP);
const RECENT_DAYS = 30;

const files = await readdir("data/raw");
const rawFile = files.filter((f) => f.startsWith("panelharga-")).sort().at(-1);
if (rawFile == null) throw new Error("no data/raw/panelharga-*.json found");
const raw = JSON.parse(await readFile(`data/raw/${rawFile}`, "utf8"));

const provinces = raw.catalog.provinces?.data ?? [];
const eceran = raw.catalog.cms_eceran?.data ?? [];
const byId = new Map(eceran.map((c) => [String(c.id), c]));
const regionCodes = provinces.map((p) => String(p.national_id).trim());

const pihpsFiles = files.filter((f) => f.startsWith("pihps-")).sort();
const allDates = [];
for (const f of pihpsFiles) {
  const d = f.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (d != null) allDates.push(d);
}
allDates.sort();
console.log(`merging PIHPS dates: ${allDates.length} (${allDates[0] ?? "none"}..${allDates.at(-1) ?? "none"})`);

const mondayOf = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
};
const monthOf = (iso) => iso.slice(0, 7) + "-01";

const newBucket = () => ({ sum: 0, n: 0 });
const bucketKey = (grup, region) => `${grup}|${region}`;

const weeks = [];
const months = [];
const weekly = new Map();
const monthly = new Map();
const cell = (store, key) => {
  let arr = store.get(key);
  if (arr == null) {
    arr = [];
    store.set(key, arr);
  }
  return arr;
};

let weekKey = null;
let weekAcc = new Map();
let monthKey = null;
let monthAcc = new Map();
const flushWeek = () => {
  if (weekKey == null) return;
  weeks.push(weekKey);
  for (const key of weekly.keys()) {
    const a = weekAcc.get(key);
    cell(weekly, key).push(a != null && a.n > 0 ? Math.round((a.sum / a.n) / 50) * 50 : null);
  }
  for (const [key, a] of weekAcc) {
    if (!weekly.has(key)) {
      weekly.set(key, new Array(weeks.length - 1).fill(null));
      weekly.get(key).push(a.n > 0 ? Math.round((a.sum / a.n) / 50) * 50 : null);
    }
  }
  weekAcc = new Map();
};
const flushMonth = () => {
  if (monthKey == null) return;
  months.push(monthKey);
  for (const key of monthly.keys()) {
    const a = monthAcc.get(key);
    cell(monthly, key).push(a != null && a.n > 0 ? Math.round((a.sum / a.n) / 50) * 50 : null);
  }
  for (const [key, a] of monthAcc) {
    if (!monthly.has(key)) {
      monthly.set(key, new Array(months.length - 1).fill(null));
      monthly.get(key).push(a.n > 0 ? Math.round((a.sum / a.n) / 50) * 50 : null);
    }
  }
  monthAcc = new Map();
};
const addSample = (acc, key, value) => {
  if (value == null) return;
  let a = acc.get(key);
  if (a == null) {
    a = newBucket();
    acc.set(key, a);
  }
  a.sum += value;
  a.n += 1;
};

const cutoff = allDates[Math.max(0, allDates.length - RECENT_DAYS)];
let yearRows = [];
let yearDates = [];
let yearOf = null;
let latestRows = [];
const recentEntries = [];
const liveByDate = new Map();
const coverage = [];
let liveTotal = 0;

const writeYear = async () => {
  if (yearOf == null) return;
  const live = yearRows.filter((r) => r.price != null).length;
  const snap = {
    date: yearDates.at(-1),
    dates: yearDates,
    level: "eceran",
    source: live > 0 ? "pihps" : "panelharga-cms",
    fetchedAt: new Date().toISOString(),
    pricesLive: live > 0,
    liveRows: live,
    expectedRows: yearRows.length,
    rows: yearRows,
  };
  await writeFile(`data/snapshots/${yearOf}.json`, JSON.stringify(snap));
  console.log(`wrote data/snapshots/${yearOf}.json dates=${yearDates.length} rows=${yearRows.length} live=${live}`);
};

await mkdir("data/snapshots", { recursive: true });

for (const date of allDates) {
  const dateRows = [];
  const pihps = JSON.parse(await readFile(`data/raw/pihps-${date}.json`, "utf8"));
  const byRegion = new Map((pihps?.rows ?? []).map((r) => [r.region_code, r.prices]));
  const national = (pihps?.rows ?? []).find((r) => r.region_code == null)?.prices ?? {};
  const scopes = pihps?.rows ?? [];
  const errorScopes = scopes.filter((r) => r.status === "http-error").length;
  const emptyScopes = scopes.filter((r) => r.status === "source-empty").length;

  const y = date.slice(0, 4);
  if (yearOf != null && y !== yearOf) await writeYear();
  if (y !== yearOf) {
    yearOf = y;
    yearRows = [];
    yearDates = [];
  }
  yearDates.push(date);

  const wk = mondayOf(date);
  if (weekKey != null && wk !== weekKey) flushWeek();
  weekKey = wk;
  const mo = monthOf(date);
  if (monthKey != null && mo !== monthKey) flushMonth();
  monthKey = mo;

  for (const grup of GRUPS) {
    const members = GRUP_MAP[grup].map((id) => byId.get(id)).filter(Boolean);
    const nat = national[grup] ?? null;
    addSample(weekAcc, bucketKey(grup, "nasional"), nat);
    addSample(monthAcc, bucketKey(grup, "nasional"), nat);
    for (const code of regionCodes) {
      const live = byRegion.get(code)?.[grup] ?? null;
      addSample(weekAcc, bucketKey(grup, code), live);
      addSample(monthAcc, bucketKey(grup, code), live);
      dateRows.push({
        date,
        commodity_id: grup,
        region_code: code,
        level: "eceran",
        price: live,
        source_id: live != null ? "pihps" : "panelharga-cms",
        panelharga_ids: members.map((m) => m.id),
        unit: grup === "minyak-goreng" ? "liter" : "kg",
      });
      if (live != null) {
        liveTotal += 1;
        liveByDate.set(date, (liveByDate.get(date) ?? 0) + 1);
        if (date >= cutoff) recentEntries.push(`  ${JSON.stringify(`${date}:${grup}:${code}`)}: ${live},`);
      }
    }
  }
  yearRows.push(...dateRows);
  if (dateRows.some((r) => r.price != null)) latestRows = dateRows;
  const dateLive = dateRows.filter((r) => r.price != null).length;
  coverage.push({
    date,
    liveCells: dateLive,
    expectedCells: dateRows.length,
    errorScopes,
    emptyScopes,
    reason:
      dateLive > 0
        ? "ok"
        : errorScopes === scopes.length && scopes.length > 0
          ? "scrape-errors"
          : errorScopes > 0
            ? "partial-scrape-errors"
            : "source-empty",
  });
}
await writeYear();
flushWeek();
flushMonth();

const coverageReport = {
  generatedAt: new Date().toISOString(),
  totalDates: coverage.length,
  liveDates: coverage.filter((c) => c.liveCells > 0).length,
  totalLiveCells: coverage.reduce((n, c) => n + c.liveCells, 0),
  totalExpectedCells: coverage.reduce((n, c) => n + c.expectedCells, 0),
  newestCoveredDate: [...liveByDate.keys()].sort().at(-1) ?? null,
  sourceEmptyDates: coverage.filter((c) => c.liveCells === 0),
};
await writeFile("data/snapshots/coverage.json", JSON.stringify(coverageReport, null, 2));
console.log(
  `coverage: dates=${coverageReport.totalDates} live=${coverageReport.liveDates} ` +
    `sourceEmpty=${coverageReport.sourceEmptyDates.length} newest=${coverageReport.newestCoveredDate}`,
);

const latestDate = [...liveByDate.keys()].sort().at(-1) ?? allDates.at(-1);
await writeFile(
  "data/snapshots/latest.json",
  JSON.stringify(
    {
      date: latestDate,
      dates: [latestDate],
      level: "eceran",
      source: "pihps",
      fetchedAt: new Date().toISOString(),
      pricesLive: latestRows.some((r) => r.price != null),
      liveRows: latestRows.filter((r) => r.price != null).length,
      expectedRows: latestRows.length,
      rows: latestRows,
    },
    null,
    2,
  ),
);

await mkdir("src/data", { recursive: true });
await writeFile(
  "src/data/prices.gen.ts",
  `export const LIVE_PRICES: Record<string, number> = {\n${recentEntries.join("\n")}\n};\n`,
);
const series = (store) =>
  [...store.entries()]
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
await writeFile(
  "src/data/trends.gen.ts",
  `export const TREND_WEEKS: string[] = ${JSON.stringify(weeks)};\n` +
    `export const TREND_WEEKLY: Record<string, (number|null)[]> = {\n${series(weekly)}\n};\n` +
    `export const TREND_MONTHS: string[] = ${JSON.stringify(months)};\n` +
    `export const TREND_MONTHLY: Record<string, (number|null)[]> = {\n${series(monthly)}\n};\n`,
);
await writeFile(
  "src/data/snapshot.gen.ts",
  `export const SNAPSHOT_META: { level: string; source: string; pricesLive: boolean; fetchedAt: string; dates: string[]; liveDates: string[] } = ${JSON.stringify({ level: "eceran", source: "pihps", pricesLive: liveTotal > 0, fetchedAt: new Date().toISOString(), dates: allDates, liveDates: [...liveByDate.keys()].sort() }, null, 2)};\n`,
);
console.log(
  `wrote latest=${latestDate} recentEntries=${recentEntries.length} weeks=${weeks.length} months=${months.length} liveTotal=${liveTotal}`,
);
