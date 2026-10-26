import type { Province } from "#/data/geo.ts"
import type { Snapshot, TrendSeries } from "#/data/provider.ts"

export type CsvDownload = { filename: string; content: string }
type CsvCell = string | number | null | undefined

/** Quote text before joining cells; a leading apostrophe neutralizes spreadsheet formulas. */
export function csvCell(value: CsvCell): string {
  if (value == null || (typeof value === "number" && !Number.isFinite(value))) return ""
  if (typeof value === "number") return String(value)
  const safe = /^(?:[\s\u0000-\u001f]*[=+@-]|[\t\r\n])/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function serializeCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`
}

const HEADER = ["tanggal", "komoditas_id", "komoditas", "wilayah_kode", "wilayah", "harga_rupiah", "satuan", "sumber", "resolusi", "rentang_dari", "rentang_sampai", "provinsi_dipilih"]
const observed = (price: number | null | undefined) => price != null && Number.isFinite(price) && price > 0 ? price : null
const filenamePart = (value: string) => value.replace(/[^a-zA-Z0-9-]/g, "-")

/** The map shows the full province grid plus the national survey average. */
export function snapshotCsv(snapshot: Snapshot, provinces: readonly Province[], selectedCode: string | null): CsvDownload | null {
  if (!snapshot.rows.some((row) => observed(row.price) != null)) return null
  const context = [snapshot.commodity.unit, "PIHPS", "observasi_harian", snapshot.date, snapshot.date, selectedCode ?? "nasional"]
  const row = (code: string, name: string, price: number | null) => [snapshot.date, snapshot.commodity.id, snapshot.commodity.name, code, name, observed(price), ...context]
  return {
    filename: `harga-${filenamePart(snapshot.commodity.id)}-${filenamePart(selectedCode ?? "nasional")}-${snapshot.date}.csv`,
    content: serializeCsv([HEADER, row("nasional", "Nasional", snapshot.nationalAvg), ...snapshot.rows.map((item) =>
      row(item.regionCode, provinces.find((province) => province.code === item.regionCode)?.name ?? item.regionCode, item.price))]),
  }
}

/** Export every loaded point, before chart decimation, and preserve provincial gaps. */
export function trendCsv(series: TrendSeries, province: Province | null, timeframe: string): CsvDownload | null {
  const national = new Map(series.national.map((point) => [point.date, observed(point.price)]))
  const selected = new Map((series.selected ?? []).map((point) => [point.date, observed(point.price)]))
  const dates = [...new Set([...national.keys(), ...selected.keys()])].sort()
    .filter((date) => date >= series.range.from && date <= series.range.to)
  if (!dates.some((date) => province == null ? national.get(date) != null : selected.get(date) != null)) return null
  const aggregation = series.range.resolution === "day" ? "observasi_harian" : series.range.resolution === "week" ? "rata_rata_mingguan" : "rata_rata_bulanan"
  const row = (date: string, code: string, name: string, price: number | null | undefined) => [
    date, series.commodity.id, series.commodity.name, code, name, price,
    series.unit, "PIHPS", aggregation, series.range.from, series.range.to, province?.code ?? "nasional",
  ]
  return {
    filename: `tren-${filenamePart(series.commodity.id)}-${filenamePart(province?.code ?? "nasional")}-${filenamePart(timeframe)}-${series.range.from}-${series.range.to}-${series.range.resolution}.csv`,
    content: serializeCsv([HEADER, ...dates.flatMap((date) => [
      row(date, "nasional", "Nasional", national.get(date)),
      ...(province == null ? [] : [row(date, province.code, province.name, selected.get(date))]),
    ])]),
  }
}

export function downloadCsv(file: CsvDownload): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = file.filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Let the browser start the download before releasing its backing URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
