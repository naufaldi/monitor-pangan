import { useRef, useState } from "react"
import { cardClass } from "@monitor-pangan/ui"
import { formatAxisPrice, formatDateShort, formatMonthYear, formatPrice } from "#/lib/format.ts"
import { axisInset, decimatedIndices } from "#/lib/chart-marks.ts"
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

type PlottedPoint = {
  index: number
  date: string
  price: number
  x: number
  y: number
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

/** Contiguous plotted runs over kept indices. Gaps break the line instead of bridging it. */
function lineRuns(
  dates: string[],
  kept: number[],
  prices: Map<string, number>,
  xFor: (index: number) => number,
  yFor: (price: number) => number,
): PlottedPoint[][] {
  const runs: PlottedPoint[][] = []
  let current: PlottedPoint[] = []
  for (const index of kept) {
    const date = dates[index]!
    const price = prices.get(date)
    if (price == null) {
      if (current.length > 0) {
        runs.push(current)
        current = []
      }
      continue
    }
    current.push({ index, date, price, x: xFor(index), y: yFor(price) })
  }
  if (current.length > 0) runs.push(current)
  return runs
}

function linePath(run: PlottedPoint[]): string {
  return run.map((point, i) => `${i === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
}

function areaPath(run: PlottedPoint[], baseY: number): string {
  if (run.length === 0) return ""
  const first = run[0]!
  const last = run[run.length - 1]!
  return `${linePath(run)} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z`
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

const CHART_WIDTH = 720
const CHART_HEIGHT = 280

/** Responsive SVG price trend. Clean continuous lines, one crosshair tooltip for dense ranges. */
export function TrendChart({ series, height = 260 }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
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

  const width = CHART_WIDTH
  const viewHeight = CHART_HEIGHT
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

  const kept = decimatedIndices(dates.length)
  const nationalRuns = lineRuns(dates, kept, nationalByDate, xFor, yForInner)
  const selectedRuns =
    selectedByDate == null ? null : lineRuns(dates, kept, selectedByDate, xFor, yForInner)

  const baseY = viewHeight - padB
  const lastNationalPoint = national.length > 0 ? national[national.length - 1]! : null
  const lastSelectedPoint = selected != null && selected.length > 0 ? selected[selected.length - 1]! : null
  const lastNationalIndex = lastNationalPoint == null ? -1 : dates.indexOf(lastNationalPoint.date)
  const lastSelectedIndex = lastSelectedPoint == null ? -1 : dates.indexOf(lastSelectedPoint.date)

  const toIndex = (clientX: number): number | null => {
    const svg = svgRef.current
    if (svg == null || dates.length === 0) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return null
    const svgX = (clientX - rect.left) * (width / rect.width)
    const fraction = (svgX - padL) / innerW
    const raw = Math.round(fraction * (dates.length - 1))
    return Math.min(Math.max(raw, 0), dates.length - 1)
  }

  const toSeries = (index: number, clientY: number): SeriesId => {
    if (selectedByDate == null) return "nasional"
    const svg = svgRef.current
    if (svg == null) return "nasional"
    const rect = svg.getBoundingClientRect()
    if (rect.height === 0) return "nasional"
    const svgY = (clientY - rect.top) * (viewHeight / rect.height)
    const date = dates[index]!
    const nationalPrice = nationalByDate.get(date)
    const selectedPrice = selectedByDate.get(date)
    if (nationalPrice == null) return "provinsi"
    if (selectedPrice == null) return "nasional"
    return Math.abs(svgY - yForInner(selectedPrice)) < Math.abs(svgY - yForInner(nationalPrice))
      ? "provinsi"
      : "nasional"
  }

  const pointAt = (clientX: number, clientY: number): ActiveMark | null => {
    const index = toIndex(clientX)
    if (index == null) return null
    return { index, series: toSeries(index, clientY) }
  }

  const activeDate = active == null ? null : dates[active.index]
  const activeNational = activeDate == null ? undefined : nationalByDate.get(activeDate)
  const activeSelected = activeDate == null || selectedByDate == null ? undefined : selectedByDate.get(activeDate)
  const activeX = active == null ? 0 : xFor(active.index)
  const activePrice = active?.series === "provinsi" ? (activeSelected ?? activeNational) : activeNational
  const activeY = activePrice == null ? baseY : yForInner(activePrice)
  const tooltipW = 176
  const tooltipH = dual ? 64 : 46
  const tooltipX = Math.min(Math.max(activeX - tooltipW / 2, padL), width - padR - tooltipW)
  const tooltipBelow = activeY - tooltipH - 12 < padT
  const tooltipY = tooltipBelow ? activeY + 14 : activeY - tooltipH - 14

  const compactAxis = dates.length > 62
  const tickFractions = dates.length <= 5 ? dates.map((_, i) => i / Math.max(dates.length - 1, 1)) : [0, 0.25, 0.5, 0.75, 1]
  const labelIndices = [...new Set(tickFractions.map((f) => Math.round(f * (dates.length - 1))))].sort((a, b) => a - b)

  const summary = dual
    ? `Tren ${series.commodity.name}, Provinsi dan Nasional.`
    : `Tren ${series.commodity.name} nasional.`
  const activeCopy =
    active == null || activeDate == null
      ? summary
      : `${summary} ${formatDateShort(activeDate)}: Nasional ${activeNational == null ? "tidak ada data" : formatPrice(activeNational, series.unit)}${dual ? `, Provinsi ${activeSelected == null ? "tidak ada data" : formatPrice(activeSelected, series.unit)}` : ""}.`

  return (
    <figure role="img" aria-label={activeCopy} className={cardClass("md")}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-xs">
        <span className="flex flex-wrap items-center gap-3 font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-ink" aria-hidden="true" />
            Nasional
          </span>
          {dual ? (
            <span className="flex items-center gap-1.5 text-ember">
              <span className="inline-block h-0.5 w-4 bg-ember" aria-hidden="true" />
              Provinsi
            </span>
          ) : null}
        </span>
        <span className="font-normal text-slate">Arahkan kursor atau sentuh grafik untuk detail</span>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${viewHeight}`}
        height={height}
        className="block h-auto w-full touch-pan-y"
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse" || event.buttons > 0) {
            setActive(pointAt(event.clientX, event.clientY))
          }
        }}
        onPointerDown={(event) => {
          setActive(pointAt(event.clientX, event.clientY))
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setActive(null)
            return
          }
          const step =
            event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : 0
          if (step === 0) return
          event.preventDefault()
          setActive((prev) => {
            const base = prev?.index ?? (step > 0 ? -1 : dates.length)
            const next =
              step === -Infinity ? 0 : step === Infinity ? dates.length - 1 : Math.min(Math.max(base + step, 0), dates.length - 1)
            return { index: next, series: prev?.series ?? "nasional" }
          })
        }}
      >
        {ticks.map((tick) => {
          const y = yForInner(tick)
          return (
            <g key={tick}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} style={{ stroke: "var(--color-hairline)" }} strokeWidth={1} />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                style={{ fill: "var(--color-slate)" }}
                className="tabular-nums"
              >
                {formatAxisPrice(tick)}
              </text>
            </g>
          )
        })}
        {nationalRuns.map((run, i) => (
          <path
            key={`national-area-${i}`}
            d={areaPath(run, baseY)}
            style={{ fill: "var(--color-ink)" }}
            fillOpacity={0.06}
            stroke="none"
          />
        ))}
        {selectedRuns?.map((run, i) => (
          <path
            key={`selected-area-${i}`}
            d={areaPath(run, baseY)}
            style={{ fill: "var(--color-ember)" }}
            fillOpacity={0.07}
            stroke="none"
          />
        ))}
        {nationalRuns.map((run, i) => (
          <path
            key={`national-line-${i}`}
            d={linePath(run)}
            fill="none"
            style={{ stroke: "var(--color-ink)" }}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {selectedRuns?.map((run, i) => (
          <path
            key={`selected-line-${i}`}
            d={linePath(run)}
            fill="none"
            style={{ stroke: "var(--color-ember)" }}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {lastNationalIndex >= 0 && lastNationalPoint != null ? (
          <circle
            cx={xFor(lastNationalIndex)}
            cy={yForInner(lastNationalPoint.price)}
            r={4.5}
            style={{ fill: "var(--color-ink)", stroke: "var(--color-paper)" }}
            strokeWidth={2}
          />
        ) : null}
        {lastSelectedIndex >= 0 && lastSelectedPoint != null ? (
          <circle
            cx={xFor(lastSelectedIndex)}
            cy={yForInner(lastSelectedPoint.price)}
            r={4.5}
            style={{ fill: "var(--color-ember)", stroke: "var(--color-paper)" }}
            strokeWidth={2}
          />
        ) : null}
        {labelIndices.map((pointIndex) => {
          const date = dates[pointIndex]!
          const x = xFor(pointIndex)
          const anchor =
            pointIndex === 0 ? "start" : pointIndex === dates.length - 1 ? "end" : "middle"
          return (
            <text key={date} x={x} y={viewHeight - 8} textAnchor={anchor} fontSize={11} style={{ fill: "var(--color-slate)" }}>
              {compactAxis ? formatMonthYear(date) : formatDateShort(date)}
            </text>
          )
        })}
        {active != null && activeDate != null ? (
          <g pointerEvents="none" aria-hidden="true">
            <line
              x1={activeX}
              x2={activeX}
              y1={padT}
              y2={baseY}
              style={{ stroke: "var(--color-slate)" }}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            {activeNational != null ? (
              <circle cx={activeX} cy={yForInner(activeNational)} r={5} style={{ fill: "var(--color-paper)", stroke: "var(--color-ink)" }} strokeWidth={2.5} />
            ) : null}
            {dual && activeSelected != null ? (
              <circle cx={activeX} cy={yForInner(activeSelected)} r={5} style={{ fill: "var(--color-paper)", stroke: "var(--color-ember)" }} strokeWidth={2.5} />
            ) : null}
            <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={8} style={{ fill: "var(--color-ink)" }} />
            <text
              x={tooltipX + 12}
              y={tooltipY + 18}
              fontSize={11}
              style={{ fill: "var(--color-paper)" }}
              opacity={0.75}
            >
              {formatDateShort(activeDate)}
            </text>
            <text
              x={tooltipX + 12}
              y={tooltipY + 34}
              fontSize={12}
              fontWeight={700}
              style={{ fill: "var(--color-paper)" }}
              className="tabular-nums"
            >
              {activeNational == null ? `${seriesLabel("nasional")}: tidak ada data` : `${seriesLabel("nasional")} ${formatPrice(activeNational, series.unit)}`}
            </text>
            {dual ? (
              <text
                x={tooltipX + 12}
                y={tooltipY + 50}
                fontSize={12}
                fontWeight={700}
                style={{ fill: "var(--color-paper)" }}
                className="tabular-nums"
              >
                {activeSelected == null ? `${seriesLabel("provinsi")}: tidak ada data` : `${seriesLabel("provinsi")} ${formatPrice(activeSelected, series.unit)}`}
              </text>
            ) : null}
          </g>
        ) : null}
        <rect
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          fill="transparent"
        />
      </svg>
      <p className="tabular-nums px-1 pt-2 text-xs text-slate">
        {formatDateShort(series.range.from)} – {formatDateShort(series.range.to)} · {unitLabel(series.unit)}
      </p>
    </figure>
  )
}

function unitLabel(unit: PriceUnit): string {
  switch (unit) {
    case "kg":
      return "Rp/kg"
    case "liter":
      return "Rp/liter"
    default: {
      const _exhaustive: never = unit
      return _exhaustive
    }
  }
}
