import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

// Rebuilds data/raw/manifest-<YYYY>.json from the pihps-<date>.json files
// on disk. Parallel range scrapes (node scripts/scrape-pihps.mjs <from>
// <to>) intentionally skip the year manifest to stay race-free, so run this
// after backfills to (re)generate the same resumable-manifest schema the
// year-chunk mode writes: { year, startedAt, updatedAt, dates }.
const files = await readdir("data/raw");
const dated = files
  .map((f) => f.match(/^pihps-(\d{4})-(\d{2})-(\d{2})\.json$/)?.slice(1))
  .filter(Boolean);

const byYear = new Map();
for (const [y, m, d] of dated) {
  const iso = `${y}-${m}-${d}`;
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push(iso);
}

await mkdir("data/raw", { recursive: true });
for (const [year, isos] of [...byYear.entries()].sort()) {
  const path = `data/raw/manifest-${year}.json`;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch {
    manifest = { year, startedAt: new Date().toISOString(), dates: {} };
  }
  for (const iso of isos.sort()) {
    const raw = JSON.parse(await readFile(`data/raw/pihps-${iso}.json`, "utf8"));
    manifest.dates[iso] = {
      iso,
      scopes: raw.rows?.length ?? 0,
      liveCells: (raw.rows ?? []).reduce(
        (n, r) => n + Object.values(r.prices ?? {}).filter((v) => v != null).length,
        0,
      ),
      fetchedAt: raw.fetchedAt,
    };
  }
  manifest.updatedAt = new Date().toISOString();
  await writeFile(path, JSON.stringify(manifest, null, 2));
  const done = Object.values(manifest.dates).filter((d) => d.liveCells != null);
  const live = done.reduce((n, d) => n + d.liveCells, 0);
  console.log(`year ${year}: dates=${done.length} liveCells=${live} manifest=${path}`);
}
