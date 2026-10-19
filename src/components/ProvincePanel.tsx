import { Badge, StatusMessage, cardClass } from "@monitor-pangan/ui"
import { formatDateShort, formatPrice } from "#/lib/format.ts"
import type { PriceUnit } from "#/data/catalog.ts"

type ProvincePanelProps = {
  commodityName: string
  provinceName: string | null
  price: number | null
  average: number | null
  min: number | null
  max: number | null
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
  const range = min == null || max == null
    ? null
    : `Termurah ${formatPrice(min, unit)} · Termahal ${formatPrice(max, unit)}`

  if (provinceName == null) {
    return (
      <aside className={cardClass("lg", "flex flex-col justify-center")}>
        <p className="text-sm text-slate">
          {commodityName} · rata-rata nasional
        </p>
        {average == null ? (
          <StatusMessage tone="empty" title="Tidak ada data" bare>
            Harga nasional belum tersedia untuk tanggal dan komoditas ini.
          </StatusMessage>
        ) : (
          <p className="tabular-nums text-balance text-3xl font-bold">
            {formatPrice(average, unit)}
          </p>
        )}
        <p className="tabular-nums mt-1 text-sm text-slate">{formatDateShort(date)}</p>
        {range != null && <p className="tabular-nums mt-2 text-sm text-slate">{range}</p>}
        <p className="mt-4 text-sm text-slate">
          Klik provinsi di peta untuk melihat detail harganya.
        </p>
      </aside>
    )
  }

  if (price == null) {
    return (
      <aside className={cardClass("lg", "flex flex-col justify-center")}>
        <p className="text-sm text-slate">
          {commodityName} · {formatDateShort(date)}
        </p>
        <h2 className="text-balance text-xl font-bold">{provinceName}</h2>
        <StatusMessage tone="empty" title="Tidak ada data" bare>
          Provinsi ini tidak disurvei PIHPS pada tanggal ini, atau sumbernya kosong.
        </StatusMessage>
      </aside>
    )
  }

  const diff = average == null || average <= 0 ? null : ((price - average) / average) * 100
  const above = diff != null && diff >= 0

  return (
    <aside className={cardClass("lg", "flex flex-col")}>
      <p className="text-sm text-slate">
        {commodityName} · {formatDateShort(date)}
      </p>
      <h2 className="text-balance text-xl font-bold">{provinceName}</h2>
      <p className="tabular-nums mt-2 text-3xl font-bold">
        {formatPrice(price, unit)}
      </p>
      {diff != null && average != null && <p className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={above ? "ember" : "neutral"} className={above ? undefined : "text-leaf-deep"}>
          {above ? "+" : ""}
          {diff.toFixed(1)}% vs nasional
        </Badge>
        <span className="tabular-nums text-sm text-slate">
          {formatPrice(average, unit)}
        </span>
      </p>}
      {diff != null && <p className="mt-4 text-sm text-slate">
        {above
          ? "Harga di sini lebih mahal dari rata-rata nasional."
          : "Harga di sini lebih murah dari rata-rata nasional."}
      </p>}
      {range != null && <p className="tabular-nums mt-2 text-sm text-slate">{range}</p>}
    </aside>
  )
}
