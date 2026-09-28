import { readdir, readFile, writeFile } from "node:fs/promises";

const COMMODITIES = [
  ["beras", "Beras", "kg"],
  ["bawang-merah", "Bawang Merah", "kg"],
  ["bawang-putih", "Bawang Putih", "kg"],
  ["cabai-merah", "Cabai Merah", "kg"],
  ["cabai-rawit", "Cabai Rawit", "kg"],
  ["daging-ayam", "Daging Ayam Ras", "kg"],
  ["daging-sapi", "Daging Sapi", "kg"],
  ["telur-ayam", "Telur Ayam Ras", "kg"],
  ["gula-pasir", "Gula Pasir", "kg"],
  ["minyak-goreng", "Minyak Goreng", "liter"],
];

const PROVINCES = [
  ["11", "Aceh"], ["12", "Sumatera Utara"], ["13", "Sumatera Barat"],
  ["14", "Riau"], ["15", "Jambi"], ["16", "Sumatera Selatan"],
  ["17", "Bengkulu"], ["18", "Lampung"], ["19", "Kepulauan Bangka Belitung"],
  ["21", "Kepulauan Riau"], ["31", "DKI Jakarta"], ["32", "Jawa Barat"],
  ["33", "Jawa Tengah"], ["34", "D.I Yogyakarta"], ["35", "Jawa Timur"],
  ["36", "Banten"], ["51", "Bali"], ["52", "Nusa Tenggara Barat"],
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

const esc = (value) => `'${String(value).replaceAll("'", "''")}'`;
const after = process.argv[2] ?? "2026-09-16";
const outPath = process.argv[3] ?? "data/fresh.sql";

const sql = [];
for (const [id, name, unit] of COMMODITIES) {
  sql.push(`INSERT OR IGNORE INTO commodities (id, name, unit) VALUES (${esc(id)}, ${esc(name)}, ${esc(unit)});`);
}
for (const [code, name] of PROVINCES) {
  sql.push(`INSERT OR IGNORE INTO regions (code, name, level) VALUES (${esc(code)}, ${esc(name)}, 'province');`);
}

const files = (await readdir("data/raw")).filter((name) => /^pihps-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
let priced = 0;
let days = 0;
for (const file of files) {
  const date = file.slice("pihps-".length, -".json".length);
  if (date <= after) continue;
  const raw = JSON.parse(await readFile(`data/raw/${file}`, "utf8"));
  let live = 0;
  for (const row of raw.rows ?? []) {
    if (row.region_code == null) continue;
    for (const [commodityId, price] of Object.entries(row.prices ?? {})) {
      if (price == null) continue;
      live += 1;
      priced += 1;
      sql.push(
        `INSERT OR REPLACE INTO prices_daily (date, commodity_id, region_code, level, price, source_id) VALUES (${esc(date)}, ${esc(commodityId)}, ${esc(row.region_code)}, 'eceran', ${Number(price)}, 'pihps');`,
      );
    }
  }
  const status = live > 0 ? "live" : "empty";
  const checkedAt = raw.fetchedAt ?? `${date}T00:00:00.000Z`;
  sql.push(
    `INSERT OR REPLACE INTO source_days (date, source_id, status, checked_at) VALUES (${esc(date)}, 'pihps', ${esc(status)}, ${esc(checkedAt)});`,
  );
  sql.push(
    `INSERT INTO job_runs (started_at, source_id, status, rows_upserted, note) VALUES (${esc(checkedAt)}, 'pihps', 'complete', ${live}, ${esc(`backfill ${date}`)});`,
  );
  days += 1;
  console.log(`${date} ${status} rows=${live}`);
}

await writeFile(outPath, sql.join("\n") + "\n");
console.log(`wrote ${outPath} days=${days} priced=${priced}`);
