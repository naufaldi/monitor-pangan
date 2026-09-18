import { useMemo, useState } from "react"
import { Input, Select, cardClass } from "@monitor-pangan/ui"
import { formatDateShort, formatPrice } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"
import { ChevronBadge } from "#/components/ChevronBadge.tsx"
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
  average: number
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
    <section className={cardClass("none", "overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
        <h2 className="text-base font-bold">
          Harga {commodityName} per provinsi
        </h2>
        <span className="tabular-nums text-sm text-slate">
          {formatDateShort(date)} · {visible.length} dari {rows.length}
        </span>
        <div className="ml-auto flex gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari provinsi…"
            aria-label="Cari provinsi"
          />
          <div className="relative flex items-center">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Urutkan"
              className="appearance-none pr-11 pl-2"
            >
              <option value="price-desc">Termahal dulu</option>
              <option value="price-asc">Termurah dulu</option>
              <option value="name">Nama A–Z</option>
            </Select>
            <span className="absolute top-1/2 right-1 -translate-y-1/2">
              <ChevronBadge />
            </span>
          </div>
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
              const price = r.price
              const missing = price == null
              const diff = missing || average === 0 ? 0 : ((price - average) / average) * 100
              const above = diff >= 0
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
                    "cursor-pointer border-t border-hairline transition-[background-color] duration-150 ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
                    r.regionCode === selectedCode && "bg-ember-soft hover:bg-ember-soft",
                  )}
                >
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="tabular-nums px-4 py-2 text-right font-semibold">
                    {missing ? "Tidak ada data" : formatPrice(price, unit)}
                  </td>
                  <td
                    className={cn(
                      "tabular-nums px-4 py-2 text-right",
                      missing ? "text-slate" : above ? "text-ember" : "text-leaf-deep",
                    )}
                  >
                    {missing ? "—" : `${above ? "+" : ""}${diff.toFixed(1)}%`}
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
