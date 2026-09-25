import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Badge, Button, Input, cardClass, cn } from "@monitor-pangan/ui"

import { sortActiveClass, tierChipClass, tierLabel, tierSwatchClass } from "#/components/daya-beli-tier.ts"
import type { PriceUnit } from "#/data/catalog.ts"
import {
  AFFORDABILITY_TIERS,
  affordabilityTier,
  filterAffordability,
  sortAffordability,
  type AffordabilityRow,
  type AffordabilitySort,
} from "#/lib/daya-beli.ts"
import { formatDateShort, formatPrice, formatRupiah } from "#/lib/format.ts"

/** Track whether the province table can still scroll sideways. */
function useTableScroll(rowCount: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ overflow: false, more: false })

  useEffect(() => {
    const el = ref.current
    if (el == null) return
    const measure = () => {
      const overflow = el.scrollWidth - el.clientWidth > 8
      const more = overflow && el.scrollWidth - el.clientWidth - el.scrollLeft > 8
      setScroll((prev) =>
        prev.overflow === overflow && prev.more === more ? prev : { overflow, more },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener("scroll", measure, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener("scroll", measure)
    }
  }, [rowCount])

  return { ref, ...scroll }
}

type DayaBeliTableProps = {
  commodityName: string
  unit: PriceUnit
  wageYear: number
  priceDate: string
  rows: AffordabilityRow[]
  busy?: boolean
}

/** Ranked formal-worker purchasing-power table. Gap provinces stay unranked at the bottom. */
export function DayaBeliTable({
  commodityName,
  unit,
  wageYear,
  priceDate,
  rows,
  busy = false,
}: DayaBeliTableProps) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<AffordabilitySort>("amount-desc")

  const visible = useMemo(
    () => filterAffordability(sortAffordability(rows, sort), query),
    [rows, sort, query],
  )
  const ranked = rows.filter((row) => row.amount != null).length
  const firstGap = visible.findIndex((row) => row.amount == null)
  const scroll = useTableScroll(visible.length)

  return (
    <section
      aria-busy={busy}
      className={cardClass("none", cn("overflow-hidden", busy && "opacity-70"))}
    >
      <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold">Per provinsi</h2>
          <p className="tabular-nums text-sm text-slate">
            {commodityName} · {formatDateShort(priceDate)} · {visible.length} dari {rows.length} · {ranked} ada datanya
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari provinsi…"
            aria-label="Cari provinsi"
            className="min-h-11 w-full lg:max-w-xs"
          />
          <div role="group" aria-label="Urutkan daya beli" className="grid grid-cols-2 gap-2 lg:flex">
            <Button
              variant="rect"
              active={sort === "amount-desc"}
              aria-pressed={sort === "amount-desc"}
              onClick={() => setSort("amount-desc")}
              className={cn("w-full lg:w-auto", sort === "amount-desc" && sortActiveClass("amount-desc"))}
            >
              Daya beli tertinggi
            </Button>
            <Button
              variant="rect"
              active={sort === "amount-asc"}
              aria-pressed={sort === "amount-asc"}
              onClick={() => setSort("amount-asc")}
              className={cn("w-full lg:w-auto", sort === "amount-asc" && sortActiveClass("amount-asc"))}
            >
              Daya beli terendah
            </Button>
          </div>
        </div>
        <ul aria-label="Skala daya beli" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
          {AFFORDABILITY_TIERS.map((tier) => (
            <li key={tier} className="flex items-center gap-1.5">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", tierSwatchClass(tier))} aria-hidden="true" />
              {tierLabel(tier)}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-hairline bg-muted" aria-hidden="true" />
            {tierLabel("gap")}
          </li>
        </ul>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate">
          Tidak ada provinsi yang cocok dengan pencarian.
        </p>
      ) : (
        <div>
          {scroll.overflow ? (
            <p className="border-b border-hairline px-4 py-2 text-xs font-semibold text-slate">
              Geser ke samping untuk melihat upah dan harga.
            </p>
          ) : null}
          <div className="relative">
            <div
              ref={scroll.ref}
              className="max-h-[480px] overflow-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf-deep"
              tabIndex={0}
              aria-label="Tabel daya beli per provinsi. Geser ke samping untuk kolom upah dan harga."
            >
              <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-left text-sm">
                <caption className="sr-only">
                  Daya beli {commodityName} pekerja formal per provinsi, {formatDateShort(priceDate)}
                </caption>
                <thead>
                  <tr className="text-xs uppercase text-slate">
                    <th className="sticky top-0 left-0 z-30 border-b border-r border-hairline bg-muted px-4 py-2 text-left font-semibold whitespace-nowrap">
                      Provinsi
                    </th>
                    <th className="sticky top-0 z-20 border-b border-hairline bg-muted px-4 py-2 text-right font-semibold whitespace-nowrap">
                      Daya beli pekerja formal
                    </th>
                    <th className="sticky top-0 z-20 border-b border-hairline bg-muted px-4 py-2 text-right font-semibold whitespace-nowrap">
                      Harga rata-rata provinsi
                    </th>
                    <th className="sticky top-0 z-20 border-b border-hairline bg-muted px-4 py-2 text-right font-semibold whitespace-nowrap">
                      UMP {wageYear} pekerja formal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, index) => {
                    const missing = row.amount == null
                    const tier = affordabilityTier(row.rank, ranked)
                    const surface = tier === "gap" ? "bg-muted" : "bg-paper"
                    return (
                      <Fragment key={row.regionCode}>
                        {index === firstGap ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="border-b border-hairline bg-muted px-4 py-2 text-xs font-semibold uppercase text-slate"
                            >
                              <span className="sticky left-4">Data tidak tersedia</span>
                            </td>
                          </tr>
                        ) : null}
                        <tr>
                          <td
                            className={cn(
                              "relative sticky left-0 z-10 border-r border-b border-hairline px-4 py-3 whitespace-nowrap",
                              surface,
                            )}
                          >
                            {tier !== "gap" ? (
                              <span
                                aria-hidden="true"
                                className={cn("absolute inset-y-0 left-0 w-0.5", tierSwatchClass(tier))}
                              />
                            ) : null}
                            <div className="flex items-center gap-2">
                              <span className={cn("font-medium text-ink", missing && "text-slate")}>{row.name}</span>
                              {row.rank != null ? (
                                <Badge tone="neutral" className={tierChipClass(tier)} title={tierLabel(tier)}>
                                  <span className="sr-only">{tierLabel(tier)} </span>#{row.rank}
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className={cn("border-b border-hairline px-4 py-3 text-right whitespace-nowrap text-ink", surface)}>
                            {missing || row.amount == null ? (
                              <span className="font-normal text-slate">data tidak tersedia</span>
                            ) : (
                              <span className="tabular-nums text-base font-bold">
                                {row.amount}
                                <span className="ml-1 text-xs font-semibold text-slate">{unit}</span>
                              </span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "tabular-nums border-b border-hairline px-4 py-3 text-right whitespace-nowrap",
                              surface,
                              missing && "text-slate",
                            )}
                          >
                            {row.price == null ? "data tidak tersedia" : formatPrice(row.price, unit)}
                          </td>
                          <td
                            className={cn(
                              "tabular-nums border-b border-hairline px-4 py-3 text-right whitespace-nowrap",
                              surface,
                              row.wageRpPerBulan == null && "text-slate",
                            )}
                          >
                            {row.wageRpPerBulan == null
                              ? "data tidak tersedia"
                              : `${formatRupiah(row.wageRpPerBulan)}/bulan`}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {scroll.more ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper"
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
