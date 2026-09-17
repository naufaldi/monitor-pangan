import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { ChevronBadge } from "#/components/ChevronBadge.tsx"
import { MoversList, type MoverItem } from "#/components/MoversList.tsx"
import { TrendChart } from "#/components/TrendChart.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { provider } from "#/data/provider.ts"
import { formatDateShort, formatPct, formatPrice } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"

export const Route = createFileRoute("/tren")({
  ssr: false,
  component: TrenPage,
})

const TIMEFRAMES = ["3H", "7H", "1B", "1T", "ALL"] as const

type Timeframe = (typeof TIMEFRAMES)[number]

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "3H": 3,
  "7H": 7,
  "1B": 31,
  "1T": 365,
  ALL: Number.MAX_SAFE_INTEGER,
}

const TIMEFRAME_RESOLUTION: Record<Timeframe, "day" | "week" | "month"> = {
  "3H": "day",
  "7H": "day",
  "1B": "week",
  "1T": "week",
  ALL: "month",
}

function directionLabel(direction: MoverItem["direction"]): string {
  switch (direction) {
    case "up":
      return "naik"
    case "down":
      return "turun"
    case "flat":
      return "stabil"
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

/** Commodity trend view with region filter and movers. */
function TrenPage() {
  const dates = useMemo(() => provider.dates(), [])
  const provinces = useMemo(() => provider.provinces(), [])
  const [commodityId, setCommodityId] = useState(COMMODITIES[0]?.id ?? "")
  const [regionCode, setRegionCode] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>("3H")

  const to = dates[dates.length - 1] ?? ""
  const window = dates.slice(-TIMEFRAME_DAYS[timeframe])
  const from = window[0] ?? to
  const series = useMemo(
    () =>
      provider.trend(commodityId, regionCode, {
        from,
        to,
        resolution: TIMEFRAME_RESOLUTION[timeframe],
      }),
    [commodityId, regionCode, from, to, timeframe],
  )

  const moverRange = useMemo(() => {
    const r = provider.trend(COMMODITIES[0]?.id ?? "", null, { resolution: "month" }).range
    return `${formatDateShort(r.from)} – ${formatDateShort(r.to)}`
  }, [])

  const movers = useMemo<MoverItem[]>(
    () =>
      COMMODITIES.map((c) => {
        const s = provider.trend(c.id, null, { resolution: "month" })
        return {
          commodityId: c.id,
          name: c.name,
          unit: c.unit,
          lastPrice: s.national.at(-1)?.price ?? 0,
          changePct: s.changePct,
          direction: s.direction,
        }
      }),
    [],
  )
  const moverById = useMemo(() => new Map(movers.map((m) => [m.commodityId, m])), [movers])

  const moves = useMemo(
    () =>
      series.national.slice(1).map((p, i) => {
        const prev = series.national[i]
        const pct =
          prev == null || prev.price === 0
            ? 0
            : ((p.price - prev.price) / prev.price) * 100
        return { date: p.date, price: p.price, pct }
      }),
    [series],
  )

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      <CommoditySelect
        commodities={COMMODITIES}
        value={commodityId}
        onChange={setCommodityId}
        hintFor={(c) => {
          const m = moverById.get(c.id)
          return m == null ? undefined : `${formatPrice(m.lastPrice, m.unit)} · ${formatPct(m.changePct)}`
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex items-center">
          <select
            value={regionCode ?? ""}
            onChange={(e) => setRegionCode(e.target.value === "" ? null : e.target.value)}
            aria-label="Wilayah"
            className="min-h-11 appearance-none rounded-lg border border-input bg-paper py-1.5 pr-11 pl-3 text-sm font-semibold"
          >
            <option value="">Nasional</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="absolute top-1/2 right-1 -translate-y-1/2">
            <ChevronBadge />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Rentang waktu">
          {TIMEFRAMES.map((t) => {
            const active = t === timeframe
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                aria-pressed={active}
                className={cn(
                  "tabular-nums min-h-11 rounded-lg border px-3 py-1.5 text-sm font-semibold",
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-hairline bg-paper text-ink",
                )}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      <TrendChart series={series} />

      <section
        aria-label="Ringkasan perubahan"
        className="rounded-xl border border-hairline bg-paper p-5"
      >
        <span className="tabular-nums rounded-full bg-ember-soft px-3 py-1 text-xs font-semibold text-ember">
          {formatPct(series.changePct)} · {directionLabel(series.direction)}
        </span>
        {moves.length === 0 ? (
          <p className="mt-3 text-sm text-slate">Belum ada pergerakan harian.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline text-sm">
            {moves.map((m) => (
              <li key={m.date} className="flex items-center gap-3 py-1.5">
                <span className="tabular-nums text-slate">{formatDateShort(m.date)}</span>
                <span className="tabular-nums ml-auto font-semibold">
                  {formatPrice(m.price, series.unit)}
                </span>
                <span className="tabular-nums w-16 text-right font-semibold">
                  {formatPct(m.pct)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MoversList items={movers} activeId={commodityId} onSelect={setCommodityId} rangeLabel={moverRange} />

      <footer className="pb-6 text-xs text-slate">
        Tren dihitung dari rata-rata nasional per tanggal survei. Angka di
        halaman ini data contoh untuk pengembangan UI — bukan data resmi.
      </footer>
    </main>
  )
}
