import { readFile, writeFile } from "node:fs/promises";

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

const esc = (v) => `'${String(v).replaceAll("'", "''")}'`;
const sql = [];
for (const [id, name, unit] of COMMODITIES)
  sql.push(`INSERT OR IGNORE INTO commodities (id, name, unit) VALUES (${esc(id)}, ${esc(name)}, ${esc(unit)});`);
for (const [code, name] of PROVINCES)
  sql.push(`INSERT OR IGNORE INTO regions (code, name, level) VALUES (${esc(code)}, ${esc(name)}, 'province');`);

const snap = JSON.parse(await readFile("data/snapshots/latest.json", "utf8"));
let priced = 0;
for (const r of snap.rows) {
  if (r.price == null) continue;
  priced++;
  sql.push(
    `INSERT OR REPLACE INTO prices_daily (date, commodity_id, region_code, level, price, source_id) VALUES (${esc(r.date)}, ${esc(r.commodity_id)}, ${esc(r.region_code)}, ${esc(r.level)}, ${r.price}, ${esc(r.source_id)});`,
  );
}

await writeFile("data/seed.sql", sql.join("\n") + "\n");
console.log(`wrote data/seed.sql statements=${sql.length} pricedRows=${priced}`);
console.log("apply locally: npx wrangler d1 execute monitor-pangan --local --file=./db/schema.sql && npx wrangler d1 execute monitor-pangan --local --file=./data/seed.sql");
