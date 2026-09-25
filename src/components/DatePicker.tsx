import { useMemo } from "react"
import { Button, Select, cardClass } from "@monitor-pangan/ui"
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

/**
 * Open the native calendar picker for the whole date field. Chromium only
 * opens the picker when the small calendar icon is clicked, so field clicks
 * must call showPicker explicitly. Falls back to focus where showPicker is
 * missing; already-open pickers throw and only need focus.
 */
function openDatePicker(target: HTMLInputElement): void {
  const picker = target as HTMLInputElement & { showPicker?: () => void }
  if (typeof picker.showPicker !== "function") {
    target.focus()
    return
  }
  try {
    picker.showPicker()
  } catch {
    target.focus()
  }
}

/** Single-date snapshot switcher that scales to hundreds of trading days. */
export function DatePicker({ dates, value, onChange }: DatePickerProps) {
  const index = dates.indexOf(value)
  const safeIndex = index === -1 ? dates.length - 1 : index
  const prev = safeIndex > 0 ? dates[safeIndex - 1] : undefined
  const next = safeIndex < dates.length - 1 ? dates[safeIndex + 1] : undefined
  const latest = dates[dates.length - 1]
  const isLatest = latest == null || value === latest

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Tanggal data"
        className={cardClass("none", "flex shrink-0 items-center gap-1 p-1")}
      >
        <Button
          variant="rect"
          aria-label="Tanggal sebelumnya"
          disabled={prev == null}
          onClick={() => prev != null && onChange(prev)}
          className="flex min-w-11 items-center justify-center px-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Chevron />
        </Button>
        <label className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg bg-paper px-1">
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
            onClick={(e) => openDatePicker(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                openDatePicker(e.currentTarget)
              }
            }}
            className="tabular-nums min-h-11 w-[9.25rem] shrink-0 cursor-pointer rounded-lg bg-transparent px-1 text-sm font-semibold text-ink"
          />
        </label>
        <Button
          variant="rect"
          aria-label="Tanggal berikutnya"
          disabled={next == null}
          onClick={() => next != null && onChange(next)}
          className="flex min-w-11 items-center justify-center px-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Chevron flipped />
        </Button>
      </div>

      <div className="relative flex shrink-0 items-center">
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Pilih tanggal perdagangan"
          className="tabular-nums w-40 shrink-0 appearance-none pr-11 pl-2 text-ink"
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
        </Select>
        <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2">
          <ChevronBadge />
        </span>
      </div>

      <span className="flex min-h-11 shrink-0 items-center" aria-hidden={isLatest}>
        <Button
          variant="rect"
          onClick={() => onChange(latest ?? "")}
          disabled={latest == null || isLatest}
          tabIndex={isLatest ? -1 : undefined}
          className={cn(isLatest && "invisible")}
        >
          Terbaru
        </Button>
      </span>

      <span className="text-xs text-slate">Hari perdagangan (Senin–Jumat)</span>
    </div>
  )
}
