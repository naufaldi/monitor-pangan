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

const files = await readdir("data/raw");
const rawFile = files.filter((f) => f.startsWith("panelharga-")).sort().at(-1);
if (rawFile == null) throw new Error("no data/raw/panelharga-*.json found");
const raw = JSON.parse(await readFile(`data/raw/${rawFile}`, "utf8"));

const provinces = raw.catalog.provinces?.data ?? [];
const eceran = raw.catalog.cms_eceran?.data ?? [];
const byId = new Map(eceran.map((c) => [String(c.id), c]));

const pihpsFiles = files.filter((f) => f.startsWith("pihps-")).sort();
const pihpsByDate = new Map();
for (const f of pihpsFiles) {
  const d = f.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (d == null) continue;
  pihpsByDate.set(d, JSON.parse(await readFile(`data/raw/${f}`, "utf8")));
}
console.log(`merging PIHPS dates: ${[...pihpsByDate.keys()].join(", ") || "none"}`);

const rows = [];
for (const [date, pihps] of pihpsByDate) {
  const byRegion = new Map((pihps?.rows ?? []).map((r) => [r.region_code, r.prices]));
  for (const [grup, ids] of Object.entries(GRUP_MAP)) {
    const members = ids.map((id) => byId.get(id)).filter(Boolean);
    for (const prov of provinces) {
      const code = String(prov.national_id).trim();
      const live = byRegion.get(code)?.[grup] ?? null;
      rows.push({
        date,
        commodity_id: grup,
        region_code: code,
        level: "eceran",
        price: live,
        source_id: live != null ? "pihps" : "panelharga-cms",
        panelharga_ids: members.map((m) => m.id),
        unit: grup === "minyak-goreng" ? "liter" : "kg",
      });
    }
  }
}

const dates = [...pihpsByDate.keys()].sort();
const latest = dates.at(-1);
const liveCount = rows.filter((r) => r.price != null).length;
const live = liveCount > 0;
const national = {};
for (const [date, pihps] of pihpsByDate)
  national[date] = (pihps?.rows ?? []).find((r) => r.region_code == null)?.prices ?? {};

const snapshot = {
  date: latest,
  dates,
  level: "eceran",
  source: live ? "pihps" : "panelharga-cms",
  fetchedAt: new Date().toISOString(),
  pricesLive: live,
  liveRows: liveCount,
  national,
  note: live
    ? `Daily eceran prices scraped from PIHPS BI pasar tradisional (${liveCount}/${rows.length} rows live, rest fall back to sample).`
    : "Catalog-only snapshot: run node scripts/scrape-pihps.mjs <YYYY-MM-DD> for live prices.",
  expectedRows: rows.length,
  rows,
};

await mkdir("data/snapshots", { recursive: true });
await writeFile("data/snapshots/latest.json", JSON.stringify(snapshot, null, 2));
await mkdir("src/data", { recursive: true });
const liveEntries = rows
  .filter((r) => r.price != null)
  .map((r) => `  ${JSON.stringify(`${r.date}:${r.commodity_id}:${r.region_code}`)}: ${r.price},`);
await writeFile(
  "src/data/prices.gen.ts",
  `export const LIVE_PRICES: Record<string, number> = {\n${liveEntries.join("\n")}\n};\n`,
);
const meta = {
  level: snapshot.level,
  source: snapshot.source,
  pricesLive: live,
  fetchedAt: snapshot.fetchedAt,
  dates,
};
await writeFile(
  "src/data/snapshot.gen.ts",
  `export const SNAPSHOT_META: { level: string; source: string; pricesLive: boolean; fetchedAt: string; dates: string[] } = ${JSON.stringify(meta, null, 2)};\n`,
);
console.log(
  `wrote data/snapshots/latest.json dates=[${dates}] rows=${rows.length} live=${liveCount} pricesLive=${live}`,
);
