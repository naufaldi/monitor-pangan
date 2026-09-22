import { useState } from "react"
import { cardClass } from "@monitor-pangan/ui"
import { formatAxisPrice, formatDateShort, formatPrice } from "#/lib/format.ts"
import {
  axisInset,
  markPaint,
  plottedIndices,
  seriesMarks,
  type MarkKind,
  type SeriesMark,
} from "#/lib/chart-marks.ts"
import { realPoints } from "#/lib/chart-summary.ts"
import type { PriceUnit } from "#/data/catalog.ts"
import type { TrendPoint, TrendSeries } from "#/data/provider.ts"

type TrendChartProps = {
  series: TrendSeries
  height?: number
}

type SeriesId = "nasional" | "provinsi"

type ActiveMark = {
  index: number
  series: SeriesId
}

const MARK_LEGEND: ReadonlyArray<{ kind: MarkKind; label: string }> = [
  { kind: "up", label: "Naik" },
  { kind: "down", label: "Turun" },
  { kind: "flat", label: "Datar" },
  { kind: "gap", label: "Tidak ada data" },
]

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

function seriesLabel(series: SeriesId): string {
  switch (series) {
    case "nasional":
      return "Nasional"
    case "provinsi":
      return "Provinsi"
    default: {
      const _exhaustive: never = series
      return _exhaustive
    }
  }
}

type MarkLayerProps = {
  marks: SeriesMark[]
  plotted: ReadonlySet<number>
  xFor: (index: number) => number
  yFor: (price: number) => number
  gapY: number
  series: SeriesId
  unit: PriceUnit
  active: ActiveMark | null
  onActive: (next: ActiveMark | null) => void
}

function MarkLayer({
  marks,
  plotted,
  xFor,
  yFor,
  gapY,
  series,
  unit,
  active,
  onActive,
}: MarkLayerProps) {
  const labelPrefix = seriesLabel(series)
  return (
    <>
      {marks.map((mark) => {
        const y = mark.price == null ? gapY : yFor(mark.price)
        const x = xFor(mark.index)
        const label =
          mark.kind === "gap" || mark.price == null
            ? `${labelPrefix} ${formatDateShort(mark.date)}: tidak ada data`
            : `${labelPrefix} ${formatDateShort(mark.date)}: ${formatPrice(mark.price, unit)}`
        const paint = markPaint(mark.kind)
        const isActive = active?.series === series && active.index === mark.index
        const show = plotted.has(mark.index) || isActive
        return (
          <g
            key={`${series}-${mark.date}`}
            data-chart-mark=""
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") onActive({ index: mark.index, series })
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") onActive(null)
            }}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") return
              event.preventDefault()
              onActive(isActive ? null : { index: mark.index, series })
            }}
          >
            <circle cx={x} cy={y} r={12} fill="transparent" />
            {show ? (
              <circle
                cx={x}
                cy={y}
                r={4.5}
                fill={paint.fill}
                stroke={paint.stroke}
                strokeWidth={2}
                tabIndex={0}
                aria-label={label}
                onFocus={() => onActive({ index: mark.index, series })}
                onBlur={() => onActive(null)}
                className="cursor-pointer"
              >
                <title>{label}</title>
              </circle>
            ) : null}
          </g>
        )
      })}
    </>
  )
}

/** Responsive SVG price trend. Dual line when a province series is present. */
export function TrendChart({ series, height = 260 }: TrendChartProps) {
  const [active, setActive] = useState<ActiveMark | null>(null)
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
  const padR = 12
  const padT = 12
  const padB = 28
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

  const ticks = [0, 1, 2, 3].map((step) => max - (step * (max - min)) / 3)
  const padL = axisInset(ticks.map((tick) => formatAxisPrice(tick)))
  const innerW = width - padL - padR
  const innerH = viewHeight - padT - padB
  const xFor = (index: number) =>
    dates.length <= 1 ? padL + innerW / 2 : padL + (index / (dates.length - 1)) * innerW
  const yForInner = (price: number) => padT + (1 - (price - min) / (max - min)) * innerH

  const nationalMarks = seriesMarks(dates, nationalByDate)
  const selectedMarks = selectedByDate == null ? null : seriesMarks(dates, selectedByDate)
  const nationalPlotted = new Set(
    plottedIndices(
      nationalMarks,
      xFor,
      active?.series === "nasional" ? active.index : null,
    ),
  )
  const selectedPlotted =
    selectedMarks == null
      ? null
      : new Set(
          plottedIndices(
            selectedMarks,
            xFor,
            active?.series === "provinsi" ? active.index : null,
          ),
        )

  const nationalLine = brokenLine(dates, nationalByDate, xFor, yForInner)
  const selectedLine =
    selectedByDate == null ? "" : brokenLine(dates, selectedByDate, xFor, yForInner)

  const baseY = viewHeight - padB
  const gapY = baseY - 10
  const activeMarks = active?.series === "provinsi" ? selectedMarks : nationalMarks
  const activeMark =
    active == null ? undefined : activeMarks?.find((mark) => mark.index === active.index)
  const activeX = activeMark != null ? xFor(activeMark.index) : 0
  const activeY =
    activeMark == null
      ? 0
      : activeMark.price == null
        ? gapY
        : yForInner(activeMark.price)
  const tooltipW = 156
  const tooltipH = 42
  const tooltipX = Math.min(Math.max(activeX - tooltipW / 2, padL), width - padR - tooltipW)
  const tooltipBelow = activeY - tooltipH - 12 < padT
  const tooltipY = tooltipBelow ? activeY + 14 : activeY - tooltipH - 14
  const labelIndices =
    dates.length <= 7
      ? dates.map((_, index) => index)
      : [0, Math.floor((dates.length - 1) / 2), dates.length - 1]

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
      <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-2 text-xs text-slate">
        {MARK_LEGEND.map((item) => {
          const paint = markPaint(item.kind)
          return (
            <li key={item.kind} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border-2"
                style={{ backgroundColor: paint.fill, borderColor: paint.stroke }}
              />
              {item.label}
            </li>
          )
        })}
      </ul>
      <svg
        viewBox={`0 0 ${width} ${viewHeight}`}
        height={height}
        className="block w-full"
        preserveAspectRatio="xMidYMid meet"
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null)
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return
          const target = event.target
          if (!(target instanceof Element) || target.closest("[data-chart-mark]") == null) {
            setActive(null)
          }
        }}
      >
        {ticks.map((tick) => {
          const y = yForInner(tick)
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
                {formatAxisPrice(tick)}
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
        <MarkLayer
          marks={nationalMarks}
          plotted={nationalPlotted}
          xFor={xFor}
          yFor={yForInner}
          gapY={gapY}
          series="nasional"
          unit={series.unit}
          active={active}
          onActive={setActive}
        />
        {selectedMarks != null && selectedPlotted != null ? (
          <MarkLayer
            marks={selectedMarks}
            plotted={selectedPlotted}
            xFor={xFor}
            yFor={yForInner}
            gapY={gapY}
            series="provinsi"
            unit={series.unit}
            active={active}
            onActive={setActive}
          />
        ) : null}
        {activeMark != null ? (
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
            <circle cx={activeX} cy={activeY} r={7} fill="none" stroke="#1a1c16" strokeWidth={2} />
            <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={8} fill="#1a1c16" />
            <text
              x={tooltipX + 12}
              y={tooltipY + 18}
              fontSize={12}
              fontWeight={700}
              fill="#ffffff"
              className="tabular-nums"
            >
              {activeMark.price == null ? "Tidak ada data" : formatPrice(activeMark.price, series.unit)}
            </text>
            <text x={tooltipX + 12} y={tooltipY + 33} fontSize={11} fill="#ffffff" opacity={0.75}>
              {formatDateShort(activeMark.date)}
            </text>
          </g>
        ) : null}
      </svg>
    </figure>
  )
}
