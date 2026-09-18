import { useState } from "react"
import { cardClass } from "@monitor-pangan/ui"
import { formatDateShort, formatPrice } from "#/lib/format.ts"
import { realPoints } from "#/lib/chart-summary.ts"
import type { TrendPoint, TrendSeries } from "#/data/provider.ts"

type TrendChartProps = {
  series: TrendSeries
  height?: number
}

function axisDates(national: TrendPoint[], selected: TrendPoint[] | null): string[] {
  const dates = new Set<string>()
  for (const point of realPoints(national)) dates.add(point.date)
  if (selected != null) {
    for (const point of realPoints(selected)) dates.add(point.date)
  }
  return [...dates].sort()
}

function priceMap(points: TrendPoint[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const point of realPoints(points)) map.set(point.date, point.price)
  return map
}

function brokenLine(
  dates: string[],
  prices: Map<string, number>,
  xFor: (index: number) => number,
  yFor: (price: number) => number,
): string {
  const cmds: string[] = []
  let drawing = false
  dates.forEach((date, index) => {
    const price = prices.get(date)
    if (price == null) {
      drawing = false
      return
    }
    cmds.push(`${drawing ? "L" : "M"}${xFor(index).toFixed(1)},${yFor(price).toFixed(1)}`)
    drawing = true
  })
  return cmds.join(" ")
}

/** Responsive SVG price trend. Dual line when a province series is present. */
export function TrendChart({ series, height = 260 }: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const national = realPoints(series.national)
  const selected = series.selected == null ? null : realPoints(series.selected)
  const dates = axisDates(series.national, series.selected)

  if (dates.length === 0) {
    return (
      <figure
        role="img"
        aria-label={`Belum ada data tren ${series.commodity.name} untuk rentang ini.`}
        className={cardClass("lg")}
      >
        <p className="text-sm text-slate">Belum ada data tren untuk rentang ini.</p>
        <p className="tabular-nums mt-1 text-sm text-slate">
          {formatDateShort(series.range.from)} – {formatDateShort(series.range.to)}
        </p>
      </figure>
    )
  }

  const width = 720
  const viewHeight = 260
  const padL = 56
  const padR = 12
  const padT = 12
  const padB = 28
  const innerW = width - padL - padR
  const innerH = viewHeight - padT - padB
  const nationalByDate = priceMap(series.national)
  const selectedByDate = selected == null ? null : priceMap(series.selected ?? [])
  const dual = selectedByDate != null

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  const consider = (price: number) => {
    if (price < min) min = price
    if (price > max) max = price
  }
  for (const point of national) consider(point.price)
  if (selected != null) {
    for (const point of selected) consider(point.price)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 1
  } else if (min === max) {
    const delta = Math.abs(min) * 0.01 || 1
    min = min - delta
    max = max + delta
  } else {
    const span = (max - min) * 0.08
    min = min - span
    max = max + span
  }

  const xFor = (index: number) =>
    dates.length <= 1 ? padL + innerW / 2 : padL + (index / (dates.length - 1)) * innerW
  const yFor = (price: number) => padT + (1 - (price - min) / (max - min)) * innerH

  const nationalLine = brokenLine(dates, nationalByDate, xFor, yFor)
  const selectedLine =
    selectedByDate == null ? "" : brokenLine(dates, selectedByDate, xFor, yFor)

  const baseY = viewHeight - padB
  const activeDate = activeIndex != null ? dates[activeIndex] : undefined
  const activePrice =
    activeDate != null
      ? (nationalByDate.get(activeDate) ?? selectedByDate?.get(activeDate))
      : undefined
  const activeX = activeIndex != null && activePrice != null ? xFor(activeIndex) : 0
  const activeY = activePrice != null ? yFor(activePrice) : 0
  const tooltipW = 156
  const tooltipH = 42
  const tooltipX = Math.min(
    Math.max(activeX - tooltipW / 2, padL),
    width - padR - tooltipW,
  )
  const tooltipBelow = activeY - tooltipH - 12 < padT
  const tooltipY = tooltipBelow ? activeY + 14 : activeY - tooltipH - 14
  const ticks = [0, 1, 2, 3].map((step) => max - (step * (max - min)) / 3)
  const labelIndices =
    dates.length <= 7 ? dates.map((_, index) => index) : [0, Math.floor((dates.length - 1) / 2), dates.length - 1]

  const summary = dual
    ? `Tren ${series.commodity.name}, Provinsi dan Nasional.`
    : `Tren ${series.commodity.name} nasional.`

  return (
    <figure role="img" aria-label={summary} className={cardClass("md")}>
      {dual ? (
        <figcaption className="flex flex-wrap items-center gap-3 px-1 pb-2 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-ink" aria-hidden="true" />
            Nasional
          </span>
          <span className="flex items-center gap-1.5 text-ember">
            <span className="inline-block h-0.5 w-4 bg-ember" aria-hidden="true" />
            Provinsi
          </span>
        </figcaption>
      ) : (
        <figcaption className="px-1 pb-2 text-xs font-semibold text-slate">Nasional</figcaption>
      )}
      <svg
        viewBox={`0 0 ${width} ${viewHeight}`}
        height={height}
        className="block w-full"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {ticks.map((tick) => {
          const y = yFor(tick)
          return (
            <g key={tick}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#e4e6df" strokeWidth={1} />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="#5c6358"
                className="tabular-nums"
              >
                {formatPrice(Math.round(tick), series.unit)}
              </text>
            </g>
          )
        })}
        {nationalLine !== "" ? (
          <path
            d={nationalLine}
            fill="none"
            stroke="#1a1c16"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {selectedLine !== "" ? (
          <path
            d={selectedLine}
            fill="none"
            stroke="#dc2626"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {labelIndices.map((pointIndex) => {
          const date = dates[pointIndex]!
          const x = xFor(pointIndex)
          const anchor =
            pointIndex === 0 ? "start" : pointIndex === dates.length - 1 ? "end" : "middle"
          return (
            <text key={date} x={x} y={viewHeight - 8} textAnchor={anchor} fontSize={11} fill="#5c6358">
              {formatDateShort(date)}
            </text>
          )
        })}
        {dates.map((date, index) => {
          const price = nationalByDate.get(date)
          if (price == null) return null
          const label = `Nasional ${formatDateShort(date)}: ${formatPrice(price, series.unit)}`
          return (
            <g
              key={`nasional-${date}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <circle
                cx={xFor(index)}
                cy={yFor(price)}
                r={10}
                fill="transparent"
              />
              <circle
                cx={xFor(index)}
                cy={yFor(price)}
                r={3.5}
                fill="#ffffff"
                stroke="#1a1c16"
                strokeWidth={2}
                tabIndex={0}
                aria-label={label}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                className="cursor-pointer"
              >
                <title>{label}</title>
              </circle>
            </g>
          )
        })}
        {selectedByDate != null
          ? dates.map((date, index) => {
              const price = selectedByDate.get(date)
              if (price == null) return null
              const label = `Provinsi ${formatDateShort(date)}: ${formatPrice(price, series.unit)}`
              return (
                <circle
                  key={`provinsi-${date}`}
                  cx={xFor(index)}
                  cy={yFor(price)}
                  r={3.5}
                  fill="#ffffff"
                  stroke="#dc2626"
                  strokeWidth={2}
                  tabIndex={0}
                  aria-label={label}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  className="cursor-pointer"
                >
                  <title>{label}</title>
                </circle>
              )
            })
          : null}
        {activePrice != null && activeDate != null ? (
          <g aria-hidden="true" pointerEvents="none">
            <line
              x1={activeX}
              x2={activeX}
              y1={activeY}
              y2={baseY}
              stroke="#5c6358"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <line
              x1={padL}
              x2={activeX}
              y1={activeY}
              y2={activeY}
              stroke="#5c6358"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <circle
              cx={activeX}
              cy={activeY}
              r={6.5}
              fill="none"
              stroke="#1a1c16"
              strokeWidth={2}
            />
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipW}
              height={tooltipH}
              rx={8}
              fill="#1a1c16"
            />
            <text
              x={tooltipX + 12}
              y={tooltipY + 18}
              fontSize={12}
              fontWeight={700}
              fill="#ffffff"
              className="tabular-nums"
            >
              {formatPrice(activePrice, series.unit)}
            </text>
            <text
              x={tooltipX + 12}
              y={tooltipY + 33}
              fontSize={11}
              fill="#ffffff"
              opacity={0.75}
            >
              {formatDateShort(activeDate)}
            </text>
          </g>
        ) : null}
      </svg>
    </figure>
  )
}
