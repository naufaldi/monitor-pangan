import { useMemo } from "react"

import { ChevronBadge } from "#/components/ChevronBadge.tsx"
import { formatDateShort } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"

type DatePickerProps = {
  dates: string[]
  value: string
  onChange: (date: string) => void
}

function monthLabel(iso: string): string {
  const parts = formatDateShort(iso).split(" ")
  return parts.length === 3 ? `${parts[1]} ${parts[2]}` : iso.slice(0, 7)
}

function nearestDate(dates: string[], target: string): string {
  if (dates.includes(target)) return target
  const targetTime = Date.parse(target)
  if (Number.isNaN(targetTime)) return dates[dates.length - 1] ?? target
  let best = dates[0] ?? target
  let bestDiff = Number.POSITIVE_INFINITY
  for (const d of dates) {
    const diff = Math.abs(Date.parse(d) - targetTime)
    if (diff < bestDiff) {
      best = d
      bestDiff = diff
    }
  }
  return best
}

function Chevron({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", flipped && "rotate-180")}
    >
      <path d="M10 3 5 8l5 5" />
    </svg>
  )
}

/** Single-date snapshot switcher that scales to hundreds of trading days. */
export function DatePicker({ dates, value, onChange }: DatePickerProps) {
  const index = dates.indexOf(value)
  const safeIndex = index === -1 ? dates.length - 1 : index
  const prev = safeIndex > 0 ? dates[safeIndex - 1] : undefined
  const next = safeIndex < dates.length - 1 ? dates[safeIndex + 1] : undefined
  const latest = dates[dates.length - 1]

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; dates: string[] }>()
    for (const d of dates) {
      const label = monthLabel(d)
      const key = d.slice(0, 7)
      const group = map.get(key)
      if (group) group.dates.push(d)
      else map.set(key, { label, dates: [d] })
    }
    return [...map.values()]
  }, [dates])

  if (dates.length === 0) return null

  const stepButton =
    "flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-hairline bg-paper px-2 text-ink transition-[scale,background-color,color,opacity] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Tanggal data"
        className="flex items-center gap-1 rounded-xl border border-hairline bg-paper p-1"
      >
        <button
          type="button"
          aria-label="Tanggal sebelumnya"
          disabled={prev == null}
          onClick={() => prev != null && onChange(prev)}
          className={stepButton}
        >
          <Chevron />
        </button>
        <input
          type="date"
          aria-label="Tanggal data"
          value={dates[safeIndex] ?? value}
          min={dates[0]}
          max={latest}
          onChange={(e) => {
            const picked = e.target.value
            if (picked) onChange(nearestDate(dates, picked))
          }}
          className="tabular-nums min-h-11 rounded-lg bg-paper px-2 text-sm font-semibold text-ink"
        />
        <button
          type="button"
          aria-label="Tanggal berikutnya"
          disabled={next == null}
          onClick={() => next != null && onChange(next)}
          className={stepButton}
        >
          <Chevron flipped />
        </button>
      </div>

      <div className="relative flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Pilih tanggal perdagangan"
          className="tabular-nums min-h-11 max-w-52 appearance-none rounded-lg border border-hairline bg-paper py-1.5 pr-11 pl-2 text-sm font-semibold text-ink"
        >
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.dates.map((d) => (
                <option key={d} value={d}>
                  {formatDateShort(d)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="absolute top-1/2 right-1 -translate-y-1/2">
          <ChevronBadge />
        </span>
      </div>

      {latest != null && value !== latest ? (
        <button
          type="button"
          onClick={() => onChange(latest)}
          className="tabular-nums min-h-11 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-sm font-semibold text-ink transition-[scale,background-color,color,opacity] duration-150 ease-out active:scale-[0.96]"
        >
          Terbaru
        </button>
      ) : null}

      <span className="text-xs text-slate">Hari perdagangan (Senin–Jumat)</span>
    </div>
  )
}
