import { formatDateShort, formatPrice } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"
import type { PriceUnit } from "#/data/catalog.ts"

type ProvincePanelProps = {
  commodityName: string
  provinceName: string | null
  price: number | null
  average: number
  min: number
  max: number
  unit: PriceUnit
  date: string
}

/** Side detail for the selected province, or the national summary. */
export function ProvincePanel({
  commodityName,
  provinceName,
  price,
  average,
  min,
  max,
  unit,
  date,
}: ProvincePanelProps) {
  const range = `Termurah ${formatPrice(min, unit)} · Termahal ${formatPrice(max, unit)}`

  if (provinceName == null || price == null) {
    return (
      <aside className="flex flex-col justify-center rounded-xl border border-hairline bg-paper p-5">
        <p className="text-sm text-slate">
          {commodityName} · rata-rata nasional
        </p>
        <p className="tabular-nums text-balance text-3xl font-bold">
          {formatPrice(average, unit)}
        </p>
        <p className="tabular-nums mt-1 text-sm text-slate">{formatDateShort(date)}</p>
        <p className="tabular-nums mt-2 text-sm text-slate">{range}</p>
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
      <p className="text-sm text-slate">
        {commodityName} · {formatDateShort(date)}
      </p>
      <h2 className="text-balance text-xl font-bold">{provinceName}</h2>
      <p className="tabular-nums mt-2 text-3xl font-bold">
        {formatPrice(price, unit)}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "tabular-nums rounded-full px-3 py-1 text-xs font-semibold",
            above ? "bg-ember-soft text-ember" : "bg-muted text-leaf-deep",
          )}
        >
          {above ? "+" : ""}
          {diff.toFixed(1)}% vs nasional
        </span>
        <span className="tabular-nums text-sm text-slate">
          {formatPrice(average, unit)}
        </span>
      </p>
      <p className="mt-4 text-sm text-slate">
        {above
          ? "Harga di sini lebih mahal dari rata-rata nasional."
          : "Harga di sini lebih murah dari rata-rata nasional."}
      </p>
      <p className="tabular-nums mt-2 text-sm text-slate">{range}</p>
    </aside>
  )
}
