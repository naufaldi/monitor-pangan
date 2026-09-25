import { Badge, cardClass, cn } from "@monitor-pangan/ui"

import type { PriceUnit } from "#/data/catalog.ts"
import type { AffordabilityRow } from "#/lib/daya-beli.ts"
import { formatDateShort } from "#/lib/format.ts"

type DayaBeliSummaryProps = {
  commodityName: string
  unit: PriceUnit
  priceDate: string
  wageYear: number
  ranked: number
  total: number
  highest: AffordabilityRow | null
  lowest: AffordabilityRow | null
  stalePriceYear: number | null
  busy: boolean
}

/** Headline purchasing-power figure for the top formal-worker province. */
export function DayaBeliSummary({
  commodityName,
  unit,
  priceDate,
  wageYear,
  ranked,
  total,
  highest,
  lowest,
  stalePriceYear,
  busy,
}: DayaBeliSummaryProps) {
  const showLow =
    lowest != null &&
    highest != null &&
    lowest.regionCode !== highest.regionCode &&
    lowest.amount != null

  return (
    <section
      aria-label="Ringkasan daya beli"
      aria-busy={busy}
      className={cardClass("lg", cn("flex flex-col gap-3", busy && "opacity-70"))}
    >
      {stalePriceYear != null ? (
        <p className="text-sm font-semibold text-ember">
          UMP {wageYear} dipadukan dengan harga {stalePriceYear} — perbandingan
          antar-tahun, bukan daya beli bulan berjalan.
        </p>
      ) : null}

      {highest == null || highest.amount == null ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate">
            {commodityName} · {formatDateShort(priceDate)}
          </p>
          <p className="text-2xl font-bold">Data tidak tersedia</p>
          <p className="text-sm text-slate">
            Belum ada harga rata-rata provinsi untuk komoditas ini, jadi daya
            beli pekerja formal tidak dihitung.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-slate">
              Daya beli tertinggi · pekerja formal · {formatDateShort(priceDate)}
            </p>
            <p className="tabular-nums mt-1 text-balance text-3xl font-bold tracking-tight">
              {highest.amount}
              <span className="ml-2 text-xl font-semibold text-slate">{unit}</span>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{highest.name}</span>
              {highest.rank != null ? (
                <Badge tone="neutral" className="bg-ink text-white">
                  #{highest.rank}
                </Badge>
              ) : null}
            </p>
            <p className="mt-2 text-sm font-semibold">
              Ilustrasi daya beli pekerja formal — bukan pengukuran upah harian.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 sm:grid-cols-3">
            {showLow ? (
              <div>
                <dt className="text-xs font-semibold text-slate">Terendah</dt>
                <dd className="tabular-nums text-sm font-bold">
                  {lowest.amount} {unit}
                </dd>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate">
                  <span>{lowest.name}</span>
                  <Badge tone="neutral">#{lowest.rank}</Badge>
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold text-slate">Provinsi berdata</dt>
              <dd className="tabular-nums text-sm font-bold">
                {ranked} dari {total}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate">Acuan upah</dt>
              <dd className="text-sm font-bold">UMP {wageYear}</dd>
              <dd className="text-xs text-slate">pekerja formal</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  )
}
