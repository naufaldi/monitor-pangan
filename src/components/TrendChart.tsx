import { formatDateShort, formatPct, formatPrice } from "#/lib/format.ts"
import type { TrendPoint, TrendSeries } from "#/data/provider.ts"

type TrendChartProps = {
  series: TrendSeries
  height?: number
}

/** Responsive SVG price trend with keyboard-accessible dots and a screen-reader data table. */
export function TrendChart({ series, height = 260 }: TrendChartProps) {
  const national = series.national

  if (national.length === 0) {
    return (
      <figure
        role="img"
        aria-label={`Belum ada data tren ${series.commodity.name} untuk rentang ini.`}
        className="rounded-xl border border-hairline bg-paper p-5"
      >
        <p className="text-sm text-slate">
          Belum ada data tren untuk rentang ini.
        </p>
        <p className="tabular-nums mt-1 text-sm text-slate">
          {formatDateShort(series.range.from)} –{" "}
          {formatDateShort(series.range.to)}
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
  const selected = series.selected

  const selectedByDate = new Map<string, number>()
  if (selected !== null) {
    for (const point of selected) {
      selectedByDate.set(point.date, point.price)
    }
  }

  let min = national[0].price
  let max = national[0].price
  const consider = (price: number) => {
    if (price < min) min = price
    if (price > max) max = price
  }
  for (const point of national) {
    consider(point.price)
  }
  if (selected !== null) {
    for (const point of selected) {
      consider(point.price)
    }
  }
  if (min === max) {
    const delta = min === 0 ? 1 : Math.abs(min) * 0.01
    min = min - delta
    max = max + delta
  } else {
    const span = (max - min) * 0.08
    min = min - span
    max = max + span
  }

  const xFor = (index: number, count: number) =>
    count <= 1 ? padL + innerW / 2 : padL + (index / (count - 1)) * innerW
  const yFor = (price: number) =>
    padT + (1 - (price - min) / (max - min)) * innerH

  const lineFor = (points: TrendPoint[], count: number) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${xFor(index, count).toFixed(1)},${yFor(point.price).toFixed(1)}`,
      )
      .join(" ")

  const nationalLine = lineFor(national, national.length)
  const baseY = padT + innerH
  const firstX = xFor(0, national.length)
  const lastX = xFor(national.length - 1, national.length)
  const nationalArea = `${nationalLine}L${lastX.toFixed(1)},${baseY}L${firstX.toFixed(1)},${baseY}Z`
  const selectedLine =
    selected !== null && selected.length > 0
      ? lineFor(selected, selected.length)
      : null

  const ticks = [0, 1, 2, 3].map((step) => max - (step * (max - min)) / 3)

  const labelIndices =
    national.length <= 7
      ? national.map((_, index) => index)
      : [0, Math.floor((national.length - 1) / 2), national.length - 1]

  const first = national[0]
  const last = national[national.length - 1]
  const summary =
    `Tren ${series.commodity.name}, ${formatDateShort(series.range.from)} sampai ${formatDateShort(series.range.to)}, ` +
    `${formatPct(series.changePct)}, dari ${formatPrice(first.price, series.unit)} menjadi ${formatPrice(last.price, series.unit)}.`

  const directionClass =
    series.direction === "up"
      ? "text-ember"
      : series.direction === "down"
        ? "text-leaf-deep"
        : "text-slate"
  const areaFill = series.direction === "up" ? "#fef2f2" : "#5c6358"
  const areaOpacity = series.direction === "up" ? 1 : 0.1

  return (
    <figure
      role="img"
      aria-label={summary}
      className="rounded-xl border border-hairline bg-paper p-4"
    >
      <figcaption className="flex flex-wrap items-baseline gap-x-2 px-1 pb-2">
        <span className="text-sm font-semibold">
          Tren {series.commodity.name}
        </span>
        <span className={`tabular-nums text-sm font-semibold ${directionClass}`}>
          {formatPct(series.changePct)}
        </span>
        <span className="tabular-nums text-xs text-slate">
          {formatDateShort(series.range.from)} –{" "}
          {formatDateShort(series.range.to)}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${viewHeight}`}
        height={height}
        className="block w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {ticks.map((tick) => {
          const y = yFor(tick)
          return (
            <g key={tick}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="#e4e6df"
                strokeWidth={1}
              />
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
        {national.length > 1 ? (
          <path d={nationalArea} fill={areaFill} fillOpacity={areaOpacity} />
        ) : null}
        <path
          d={nationalLine}
          fill="none"
          stroke="#1a1c16"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {selectedLine !== null ? (
          <path
            d={selectedLine}
            fill="none"
            stroke="#dc2626"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {labelIndices.map((pointIndex) => {
          const point = national[pointIndex]
          const x = xFor(pointIndex, national.length)
          const anchor =
            pointIndex === 0
              ? "start"
              : pointIndex === national.length - 1
                ? "end"
                : "middle"
          return (
            <text
              key={point.date}
              x={x}
              y={viewHeight - 8}
              textAnchor={anchor}
              fontSize={11}
              fill="#5c6358"
            >
              {formatDateShort(point.date)}
            </text>
          )
        })}
        {national.map((point, index) => {
          const label = `Nasional ${formatDateShort(point.date)}: ${formatPrice(point.price, series.unit)}`
          return (
            <circle
              key={`nasional-${point.date}`}
              cx={xFor(index, national.length)}
              cy={yFor(point.price)}
              r={3.5}
              fill="#ffffff"
              stroke="#1a1c16"
              strokeWidth={2}
              tabIndex={0}
              aria-label={label}
            >
              <title>{label}</title>
            </circle>
          )
        })}
        {selected !== null
          ? selected.map((point, index) => {
              const label = `Wilayah terpilih ${formatDateShort(point.date)}: ${formatPrice(point.price, series.unit)}`
              return (
                <circle
                  key={`terpilih-${point.date}`}
                  cx={xFor(index, selected.length)}
                  cy={yFor(point.price)}
                  r={3.5}
                  fill="#ffffff"
                  stroke="#dc2626"
                  strokeWidth={2}
                  tabIndex={0}
                  aria-label={label}
                >
                  <title>{label}</title>
                </circle>
              )
            })
          : null}
      </svg>
      <details className="mt-2 px-1 text-sm">
        <summary className="cursor-pointer text-sm text-slate">
          Data tren
        </summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate">
              <th className="py-1 pr-2 font-semibold">Tanggal</th>
              <th className="py-1 pr-2 text-right font-semibold">Nasional</th>
              {selected !== null ? (
                <th className="py-1 text-right font-semibold">
                  Wilayah terpilih
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {national.map((point) => {
              const selectedPrice = selectedByDate.get(point.date)
              return (
                <tr
                  key={point.date}
                  className="border-t border-hairline"
                >
                  <td className="py-1 pr-2">
                    {formatDateShort(point.date)}
                  </td>
                  <td className="tabular-nums py-1 pr-2 text-right font-semibold">
                    {formatPrice(point.price, series.unit)}
                  </td>
                  {selected !== null ? (
                    <td className="tabular-nums py-1 text-right">
                      {selectedPrice === undefined
                        ? "–"
                        : formatPrice(selectedPrice, series.unit)}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
