import { formatDateShort, formatPrice } from "#/lib/format.ts"
import type { PriceUnit } from "#/data/catalog.ts"

type ProvincePanelProps = {
  provinceName: string | null
  price: number | null
  average: number
  unit: PriceUnit
  date: string
}

/** Side detail for the selected province, or the national summary. */
export function ProvincePanel({
  provinceName,
  price,
  average,
  unit,
  date,
}: ProvincePanelProps) {
  if (provinceName == null || price == null) {
    return (
      <aside className="flex flex-col justify-center rounded-xl border border-hairline bg-paper p-5">
        <p className="text-sm text-slate">Rata-rata nasional</p>
        <p className="tabular-nums text-3xl font-bold">
          {formatPrice(average, unit)}
        </p>
        <p className="mt-1 text-sm text-slate">{formatDateShort(date)}</p>
        <p className="mt-4 text-sm text-slate">
          Klik provinsi di peta untuk melihat detail harganya.
        </p>
      </aside>
    )
  }

  const diff = average === 0 ? 0 : ((price - average) / average) * 100
  const above = diff >= 0

  return (
    <aside className="flex flex-col rounded-xl border border-hairline bg-paper p-5">
      <p className="text-sm text-slate">{formatDateShort(date)}</p>
      <h2 className="text-xl font-bold">{provinceName}</h2>
      <p className="tabular-nums mt-2 text-3xl font-bold">
        {formatPrice(price, unit)}
      </p>
      <p
        className={`tabular-nums mt-1 text-sm font-semibold ${above ? "text-ember" : "text-leaf-deep"}`}
      >
        {above ? "+" : ""}
        {diff.toFixed(1)}% vs rata-rata nasional ({formatPrice(average, unit)})
      </p>
      <p className="mt-4 text-sm text-slate">
        {above
          ? "Harga di sini lebih mahal dari rata-rata nasional."
          : "Harga di sini lebih murah dari rata-rata nasional."}
      </p>
    </aside>
  )
}
