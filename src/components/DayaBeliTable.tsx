import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Badge, Panel, SearchInput, SegmentedControl, StatusMessage, cn, tableClass, tdClass, thClass } from "@monitor-pangan/ui"

import { tierChipClass, tierLabel, tierSwatchClass } from "#/components/daya-beli-tier.ts"
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
    <Panel
      title="Per provinsi"
      busy={busy}
      description={
        <span className="tabular-nums">
          {commodityName} · {formatDateShort(priceDate)} · {visible.length} dari {rows.length} · {ranked} ada datanya
        </span>
      }
      toolbar={
        <>
          <SearchInput
            label="Cari provinsi"
            value={query}
            onValueChange={setQuery}
            placeholder="Cari provinsi…"
            className="lg:max-w-xs"
          />
          <SegmentedControl
            label="Urutkan daya beli"
            options={[
              { value: "amount-desc", label: "Daya beli tertinggi" },
              { value: "amount-asc", label: "Daya beli terendah" },
            ] as const}
            value={sort === "amount-asc" ? "amount-asc" : "amount-desc"}
            onChange={setSort}
            className="grid grid-cols-2 lg:flex"
            itemClassName="w-full lg:w-auto"
          />
        </>
      }
      headerExtra={
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
      }
    >

      {visible.length === 0 ? (
        <StatusMessage tone="empty" title="Tidak ada provinsi yang cocok dengan pencarian." bare />
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
              className="max-h-[480px] overflow-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              tabIndex={0}
              aria-label="Tabel daya beli per provinsi. Geser ke samping untuk kolom upah dan harga."
            >
              <table className={cn(tableClass, "min-w-[52rem]")}>
                <caption className="sr-only">
                  Daya beli {commodityName} pekerja formal per provinsi, {formatDateShort(priceDate)}
                </caption>
                <thead>
                  <tr>
                    <th className={thClass("start", "sticky top-0 left-0 z-30 border-r")}>
                      Provinsi
                    </th>
                    <th className={thClass("end", "sticky top-0 z-20")}>
                      Daya beli pekerja formal
                    </th>
                    <th className={thClass("end", "sticky top-0 z-20")}>
                      Harga rata-rata provinsi
                    </th>
                    <th className={thClass("end", "sticky top-0 z-20")}>
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
                              tdClass("start", "relative sticky left-0 z-10 border-r py-3 whitespace-nowrap"),
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
                          <td className={tdClass("end", cn("py-3 text-ink", surface))}>
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
                              tdClass("end", "py-3"),
                              surface,
                              missing && "text-slate",
                            )}
                          >
                            {row.price == null ? "data tidak tersedia" : formatPrice(row.price, unit)}
                          </td>
                          <td
                            className={cn(
                              tdClass("end", "py-3"),
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
    </Panel>
  )
}
