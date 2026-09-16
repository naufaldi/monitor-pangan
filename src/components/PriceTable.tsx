import { useMemo, useState } from "react"

import { formatPrice } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"
import type { PriceUnit } from "#/data/catalog.ts"

export type TableRow = {
  regionCode: string
  name: string
  price: number
}

type PriceTableProps = {
  rows: TableRow[]
  unit: PriceUnit
  average: number
  selectedCode: string | null
  onSelect: (code: string) => void
}

type SortKey = "price-desc" | "price-asc" | "name"

/** Sortable, searchable province price table synced with the map. */
export function PriceTable({ rows, unit, average, selectedCode, onSelect }: PriceTableProps) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("price-desc")

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q === "" ? rows : rows.filter((r) => r.name.toLowerCase().includes(q))
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "id")
      return sort === "price-asc" ? a.price - b.price : b.price - a.price
    })
  }, [rows, query, sort])

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-paper">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
        <h2 className="text-base font-bold">Harga per provinsi</h2>
        <span className="tabular-nums text-sm text-slate">
          {visible.length} dari {rows.length}
        </span>
        <div className="ml-auto flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari provinsi…"
            aria-label="Cari provinsi"
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Urutkan"
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="price-desc">Termahal dulu</option>
            <option value="price-asc">Termurah dulu</option>
            <option value="name">Nama A–Z</option>
          </select>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase text-slate">
            <tr>
              <th className="px-4 py-2 font-semibold">Provinsi</th>
              <th className="px-4 py-2 text-right font-semibold">Harga</th>
              <th className="px-4 py-2 text-right font-semibold">vs Rata-rata</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const diff = average === 0 ? 0 : ((r.price - average) / average) * 100
              const above = diff >= 0
              return (
                <tr
                  key={r.regionCode}
                  onClick={() => onSelect(r.regionCode)}
                  className={cn(
                    "cursor-pointer border-t border-hairline",
                    r.regionCode === selectedCode && "bg-ember-soft",
                  )}
                >
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="tabular-nums px-4 py-2 text-right font-semibold">
                    {formatPrice(r.price, unit)}
                  </td>
                  <td
                    className={cn(
                      "tabular-nums px-4 py-2 text-right",
                      above ? "text-ember" : "text-leaf-deep",
                    )}
                  >
                    {above ? "+" : ""}
                    {diff.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
