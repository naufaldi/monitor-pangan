import { Badge, Stat, StatList, StatusMessage, cardClass, cn } from "@monitor-pangan/ui"

import { tierChipClass, tierLabel } from "#/components/daya-beli-tier.ts"
import type { PriceUnit } from "#/data/catalog.ts"
import { affordabilityTier, type AffordabilityRow } from "#/lib/daya-beli.ts"
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
  const highTier = affordabilityTier(highest?.rank ?? null, ranked)
  const lowTier = affordabilityTier(lowest?.rank ?? null, ranked)

  return (
    <section
      aria-label="Ringkasan daya beli"
      aria-busy={busy}
      className={cardClass("none", cn("overflow-hidden", busy && "opacity-70"))}
    >
      {stalePriceYear != null ? (
        <p className="bg-ember-soft px-5 py-3 text-sm font-semibold text-ember">
          UMP {wageYear} dipadukan dengan harga {stalePriceYear} — perbandingan
          antar-tahun, bukan daya beli bulan berjalan.
        </p>
      ) : null}

      {highest == null || highest.amount == null ? (
        <div className="flex flex-col gap-1 p-5">
          <p className="text-sm text-slate">
            {commodityName} · {formatDateShort(priceDate)}
          </p>
          <StatusMessage tone="empty" title="Data tidak tersedia" bare className="px-0 py-0">
            Belum ada harga rata-rata provinsi untuk komoditas ini, jadi daya
            beli pekerja formal tidak dihitung.
          </StatusMessage>
        </div>
      ) : (
        <>
          <div className="relative px-5 py-5">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-leaf-deep" />
            <p className="text-sm text-slate">
              Daya beli tertinggi · pekerja formal · {formatDateShort(priceDate)}
            </p>
            <p className="tabular-nums mt-1 text-balance text-3xl font-bold tracking-tight text-leaf-deep">
              {highest.amount}
              <span className="ml-2 text-xl font-semibold text-slate">{unit}</span>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-ink">{highest.name}</span>
              {highest.rank != null ? (
                <Badge tone="neutral" className={tierChipClass(highTier)} title={tierLabel(highTier)}>
                  <span className="sr-only">{tierLabel(highTier)} </span>#{highest.rank}
                </Badge>
              ) : null}
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              Ilustrasi daya beli pekerja formal — bukan pengukuran upah harian.
            </p>
            <p className="mt-1 text-xs text-slate">
              Hijau = daya beli lebih kuat, merah = lebih lemah.
            </p>
          </div>
          <StatList columns={3} className="px-5 py-4">
            {showLow ? (
              <Stat
                label="Terendah"
                accent="ember"
                value={<>{lowest.amount} {unit}</>}
                hint={
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{lowest.name}</span>
                    <Badge tone="neutral" className={tierChipClass(lowTier)} title={tierLabel(lowTier)}>
                      <span className="sr-only">{tierLabel(lowTier)} </span>#{lowest.rank}
                    </Badge>
                  </span>
                }
              />
            ) : null}
            <Stat label="Provinsi berdata" value={<>{ranked} dari {total}</>} />
            <Stat label="Acuan upah" value={`UMP ${wageYear}`} hint="pekerja formal" />
          </StatList>
        </>
      )}
    </section>
  )
}
