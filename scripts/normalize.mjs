import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { Effect, Schema } from "effect";
import { ArchiveError, io, readRaw, summarizeRaw, timestamp } from "./pihps-scrape.mjs";
import { mondayOf, monthBucket } from "../src/lib/civil-date.ts";

Effect.runPromise(Effect.gen(function* () {
const now = yield* timestamp;
const coverage = [];


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

const files = yield* io(() => readdir("data/raw"));
const rawFile = files.filter((f) => f.startsWith("panelharga-")).sort().at(-1);
if (rawFile == null) return yield* Effect.fail(new ArchiveError({ message: "no data/raw/panelharga-*.json found" }));
const Id = Schema.Union(Schema.String, Schema.Number);
const PanelCatalog = Schema.Struct({ catalog: Schema.Struct({
  provinces: Schema.optional(Schema.Struct({ data: Schema.Array(Schema.Struct({ national_id: Id })) })),
  cms_eceran: Schema.optional(Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Id })) })),
}) });
const raw = yield* io(() => readFile(`data/raw/${rawFile}`, "utf8")).pipe(Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(PanelCatalog))));

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

const monthOf = monthBucket;

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
let liveTotal = 0;

const writeYear = () => Effect.gen(function* () {
  if (yearOf == null) return;
  const live = yearRows.filter((r) => r.price != null).length;
  const snap = {
    date: yearDates.at(-1),
    dates: yearDates,
    level: "eceran",
    source: live > 0 ? "pihps" : "panelharga-cms",
    fetchedAt: now,
    pricesLive: live > 0,
    liveRows: live,
    expectedRows: yearRows.length,
    rows: yearRows,
  };
  yield* io(() => writeFile(`data/snapshots/${yearOf}.json`, JSON.stringify(snap)));
  console.log(`wrote data/snapshots/${yearOf}.json dates=${yearDates.length} rows=${yearRows.length} live=${live}`);
});

yield* io(() => mkdir("data/snapshots", { recursive: true }));

for (const date of allDates) {
  const dateRows = [];
  const pihps = yield* readRaw(`data/raw/pihps-${date}.json`);
  coverage.push(summarizeRaw(pihps));
  const byRegion = new Map((pihps?.rows ?? []).map((r) => [r.region_code, r.prices]));
  const national = (pihps?.rows ?? []).find((r) => r.region_code == null)?.prices ?? {};

  const y = date.slice(0, 4);
  if (yearOf != null && y !== yearOf) yield* writeYear();
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
}
yield* writeYear();
flushWeek();
flushMonth();

const latestDate = [...liveByDate.keys()].sort().at(-1) ?? allDates.at(-1);
yield* io(() => writeFile(
  "data/snapshots/latest.json",
  JSON.stringify(
    {
      date: latestDate,
      dates: [latestDate],
      level: "eceran",
      source: "pihps",
      fetchedAt: now,
      pricesLive: latestRows.some((r) => r.price != null),
      liveRows: latestRows.filter((r) => r.price != null).length,
      expectedRows: latestRows.length,
      rows: latestRows,
    },
    null,
    2,
  ),
));

yield* io(() => mkdir("src/data", { recursive: true }));
yield* io(() => writeFile(
  "src/data/prices.gen.ts",
  `export const LIVE_PRICES: Record<string, number> = {\n${recentEntries.join("\n")}\n};\n`,
));
const series = (store) =>
  [...store.entries()]
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
yield* io(() => writeFile(
  "src/data/trends.gen.ts",
  `export const TREND_WEEKS: string[] = ${JSON.stringify(weeks)};\n` +
    `export const TREND_WEEKLY: Record<string, (number|null)[]> = {\n${series(weekly)}\n};\n` +
    `export const TREND_MONTHS: string[] = ${JSON.stringify(months)};\n` +
    `export const TREND_MONTHLY: Record<string, (number|null)[]> = {\n${series(monthly)}\n};\n`,
));
yield* io(() => writeFile(
  "src/data/snapshot.gen.ts",
  `export const SNAPSHOT_META: { level: string; source: string; pricesLive: boolean; fetchedAt: string; dates: string[]; liveDates: string[] } = ${JSON.stringify({ level: "eceran", source: "pihps", pricesLive: liveTotal > 0, fetchedAt: now, dates: allDates, liveDates: [...liveByDate.keys()].sort() }, null, 2)};\n`,
));
console.log(
  `wrote latest=${latestDate} recentEntries=${recentEntries.length} weeks=${weeks.length} months=${months.length} liveTotal=${liveTotal}`,
);

yield* io(() => writeFile("data/snapshots/coverage.json", JSON.stringify({ dates: coverage, newestVerifiedLiveDate: coverage.filter((d) => d.verified && d.liveCells > 0).at(-1)?.iso ?? null }, null, 2)));
})).catch((error) => { console.error(String(error)); process.exitCode = 1 });
