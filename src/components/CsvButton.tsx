import { Button } from "@monitor-pangan/ui"
import { downloadCsv, type CsvDownload } from "#/lib/price-csv.ts"

/** Only a ready selection can supply a file. Loading/error states pass null. */
export function CsvButton({ file }: { file: CsvDownload | null }) {
  return <Button disabled={file == null} onClick={() => { if (file != null) downloadCsv(file) }}>Unduh CSV</Button>
}
