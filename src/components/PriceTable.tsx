import { useMemo, useState } from "react"
import { Delta, Panel, SearchInput, SegmentedControl, StatusMessage, cn, focusRing, selectedRowClass, tableClass, tdClass, thClass } from "@monitor-pangan/ui"
import { formatDateShort, formatPct, formatPrice, trendDirection } from "#/lib/format.ts"
import type { PriceUnit } from "#/data/catalog.ts"

export type TableRow = {
  regionCode: string
  name: string
  price: number | null
}

type PriceTableProps = {
  commodityName: string
  date: string
  rows: TableRow[]
  unit: PriceUnit
  average: number | null
  selectedCode: string | null
  onSelect: (code: string) => void
}

type SortKey = "price-desc" | "price-asc" | "name"

/** Sortable, searchable province price table synced with the map. */
export function PriceTable({
  commodityName,
  date,
  rows,
  unit,
  average,
  selectedCode,
  onSelect,
}: PriceTableProps) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("price-desc")

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q === "" ? rows : rows.filter((r) => r.name.toLowerCase().includes(q))
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "id")
      if (a.price == null && b.price == null) return 0
      if (a.price == null) return 1
      if (b.price == null) return -1
      return sort === "price-asc" ? a.price - b.price : b.price - a.price
    })
  }, [rows, query, sort])

  return (
    <Panel
      title={`Harga ${commodityName} per provinsi`}
      description={
        <span className="tabular-nums">
          {formatDateShort(date)} · {visible.length} dari {rows.length}
        </span>
      }
      toolbar={
        <>
          <SearchInput
            label="Cari provinsi"
            value={query}
            onValueChange={setQuery}
            placeholder="Cari provinsi…"
            className="sm:w-56"
          />
          <SegmentedControl
            label="Urutkan"
            options={[
              { value: "price-desc", label: "Termahal" },
              { value: "price-asc", label: "Termurah" },
              { value: "name", label: "Nama A–Z" },
            ] as const}
            value={sort}
            onChange={setSort}
            className="grid w-full grid-cols-3 sm:flex sm:w-auto"
          />
        </>
      }
    >
      <div className="max-h-[480px] overflow-auto">
        <table className={tableClass}>
          <thead className="sticky top-0">
            <tr>
              <th className={thClass("start")}>Provinsi</th>
              <th className={thClass("end")}>Harga</th>
              <th className={thClass("end")}>Dibanding rata-rata</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const price = r.price
              const missing = price == null
              const diff = missing || average == null || average <= 0 ? null : ((price - average) / average) * 100
              return (
                <tr
                  key={r.regionCode}
                  tabIndex={0}
                  aria-selected={r.regionCode === selectedCode}
                  onClick={() => onSelect(r.regionCode)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelect(r.regionCode)
                    }
                  }}
                  className={cn(
                    "cursor-pointer transition-[background-color] duration-150 ease-out hover:bg-muted",
                    focusRing,
                    "focus-visible:outline-offset-[-2px]",
                    r.regionCode === selectedCode && selectedRowClass,
                  )}
                >
                  <td className={tdClass("start", "font-medium")}>{r.name}</td>
                  <td className={tdClass("end", "font-semibold")}>
                    {missing ? "Tidak ada data" : formatPrice(price, unit)}
                  </td>
                  <td className={tdClass("end")}>
                    {diff == null ? (
                      <span className="text-slate">—</span>
                    ) : (
                      <Delta direction={trendDirection(diff)}>{formatPct(diff)}</Delta>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {visible.length === 0 ? (
        <StatusMessage tone="empty" title="Tidak ada provinsi yang cocok dengan pencarian." bare />
      ) : null}
    </Panel>
  )
}
