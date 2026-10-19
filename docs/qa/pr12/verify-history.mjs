// Read-only QA check. Run from the repository root:
// rtk proxy node docs/qa/pr12/verify-history.mjs <local-d1.sqlite> [before-wrangler.json]
// Optional baseline is the ordered Wrangler SELECT export documented in the runbook.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const ordered = "SELECT date, commodity_id, region_code, level, price, source_id, raw_ref FROM prices_daily";
const order = " ORDER BY date, commodity_id, region_code, level";
const checksum = (sql) => {
 const hash = createHash("sha256"); hash.update("["); let count = 0;
 for (const row of db.prepare(sql).iterate()) { if (count++) hash.update(","); hash.update(JSON.stringify(row)); }
 hash.update("]"); return { cells: count, sha256: hash.digest("hex") };
};
const recent = checksum(ordered + " WHERE date >= '2026-09-16'" + order);
if (process.argv[3]) {
 const baseline = JSON.parse(readFileSync(process.argv[3], "utf8"))[0].results;
 const baselineHash = createHash("sha256").update(JSON.stringify(baseline)).digest("hex");
 assert.equal(recent.cells, baseline.length); assert.equal(recent.sha256, baselineHash);
}
const fixtures = ["2018-10-09", "2025-10-30"].map(date => {
 const fixture = JSON.parse(readFileSync(`src/data/fixtures/pihps-${date}.json`, "utf8"));
 const observed = new Map(db.prepare("SELECT region_code, price FROM prices_daily WHERE date=? AND commodity_id='beras' AND source_id='pihps' AND level='eceran'").all(date).map(r => [r.region_code, r.price]));
 const actual = fixture.rows.map(row => ({ regionCode: row.regionCode, price: observed.get(row.regionCode) ?? null }));
 assert.deepEqual(actual, fixture.rows);
 const prices = actual.filter(r => r.price != null).map(r => r.price);
 return { date, canonicalCells: actual.length, pricedCount: prices.length, nationalAvg: Math.round(prices.reduce((a,b)=>a+b,0)/prices.length/50)*50 };
});
const full = checksum(ordered + order);
const coverage = db.prepare("SELECT COUNT(*) AS count FROM source_days").get().count;
const jobs = db.prepare("SELECT COUNT(*) AS count FROM job_runs").get().count;
const summary = { full, recent, dates: db.prepare("SELECT COUNT(DISTINCT date) AS count FROM prices_daily").get().count, coverage, jobs, fixtures };
assert.equal(fixtures[0].nationalAvg,11700); assert.equal(fixtures[1].nationalAvg,15750);
console.log(JSON.stringify(summary)); db.close();
