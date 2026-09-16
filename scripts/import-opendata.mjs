import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const MANUAL_DIR = "data/raw";
const hint = `Open Data full CSV/XLSX downloads are gated behind a survey form + SAPA (https://sapa.badanpangan.go.id/).
Manual speed-run step:
1. Open https://data.badanpangan.go.id/datasetpublications?search=harga
2. Pick "Rata-rata Harga Pangan Bulanan Tingkat Konsumen Provinsi" (latest month)
3. Complete the download survey, save the file as ${MANUAL_DIR}/manual-konsumen-provinsi-<YYYY-MM>.csv
4. Re-run: npm run normalize
`;

await mkdir(MANUAL_DIR, { recursive: true });
const files = await readdir(MANUAL_DIR).catch(() => []);
const manuals = files.filter((f) => f.startsWith("manual-"));
if (manuals.length === 0) {
  console.log("No manual CSV drops found.\n");
  console.log(hint);
} else {
  console.log(`Found ${manuals.length} manual drop(s):`);
  for (const f of manuals) console.log(` - ${join(MANUAL_DIR, f)}`);
}
