import { Select, cardClass } from "@monitor-pangan/ui"
import { ChevronBadge } from "#/components/ChevronBadge.tsx"
import type { PriceUnit } from "#/data/catalog.ts"
import {
  type AffordabilityRow,
  type AffordabilitySort,
} from "#/lib/daya-beli.ts"
import { formatDateShort, formatPrice, formatRupiah } from "#/lib/format.ts"

type DayaBeliTableProps = {
  commodityName: string
  unit: PriceUnit
  wageYear: number
  priceDate: string
  rows: AffordabilityRow[]
  sort: AffordabilitySort
  onSortChange: (sort: AffordabilitySort) => void
}

/** Ranked kg-per-UMP table; gap provinces trail unranked, never last-ranked. */
export function DayaBeliTable({
  commodityName,
  unit,
  wageYear,
  priceDate,
  rows,
  sort,
  onSortChange,
}: DayaBeliTableProps) {
  const ranked = rows.filter((r) => r.amount != null).length
  return (
    <section className={cardClass("none", "overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
        <h2 className="text-base font-bold">
          Daya beli {commodityName} pekerja formal per provinsi
        </h2>
        <span className="tabular-nums text-sm text-slate">
          {formatDateShort(priceDate)} · {ranked} dari {rows.length} provinsi ada datanya
        </span>
        <div className="relative ml-auto flex items-center">
          <Select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as AffordabilitySort)}
            aria-label="Urutkan"
            className="appearance-none pr-11 pl-2"
          >
            <option value="amount-desc">Daya beli tertinggi</option>
            <option value="amount-asc">Daya beli terendah</option>
            <option value="name">Nama A–Z</option>
          </Select>
          <span className="absolute top-1/2 right-1 -translate-y-1/2">
            <ChevronBadge />
          </span>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase text-slate">
            <tr>
              <th className="px-4 py-2 font-semibold">Peringkat</th>
              <th className="px-4 py-2 font-semibold">Provinsi</th>
              <th className="px-4 py-2 text-right font-semibold">
                UMP {wageYear} pekerja formal
              </th>
              <th className="px-4 py-2 text-right font-semibold">Harga rata-rata provinsi</th>
              <th className="px-4 py-2 text-right font-semibold">Daya beli pekerja formal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const missing = r.amount == null
              return (
                <tr key={r.regionCode} className="border-t border-hairline">
                  <td className="tabular-nums px-4 py-2 text-slate">
                    {r.rank ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="tabular-nums px-4 py-2 text-right">
                    {r.wageRpPerBulan == null
                      ? "data tidak tersedia"
                      : `${formatRupiah(r.wageRpPerBulan)}/bulan`}
                  </td>
                  <td className="tabular-nums px-4 py-2 text-right">
                    {r.price == null ? "data tidak tersedia" : formatPrice(r.price, unit)}
                  </td>
                  <td className="tabular-nums px-4 py-2 text-right font-semibold">
                    {missing ? (
                      <span className="font-normal text-slate">data tidak tersedia</span>
                    ) : (
                      `${r.amount} ${unit}`
                    )}
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
