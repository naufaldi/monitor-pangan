import { useId } from "react"
import { Button, Input } from "@monitor-pangan/ui"
import { cn } from "#/lib/utils.ts"

type DatePickerProps = {
  dates: string[]
  value: string
  onChange: (date: string) => void
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

/** One date control: step by trading day, or pick any date and snap to the nearest trading day. */
export function DatePicker({ dates, value, onChange }: DatePickerProps) {
  const index = dates.indexOf(value)
  const safeIndex = index === -1 ? dates.length - 1 : index
  const prev = safeIndex > 0 ? dates[safeIndex - 1] : undefined
  const next = safeIndex < dates.length - 1 ? dates[safeIndex + 1] : undefined
  const latest = dates[dates.length - 1]
  const isLatest = latest == null || value === latest
  const hintId = useId()

  if (dates.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {/* Sits above the controls like a field label, so toolbars that align controls by their bottom edge stay level. */}
      <p id={hintId} className="text-sm text-slate">
        Tanggal · hari perdagangan (Senin–Jumat)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Tanggal data"
          className="flex shrink-0 items-center gap-2"
        >
          <Button
            variant="rect"
            aria-label="Tanggal sebelumnya"
            disabled={prev == null}
            onClick={() => prev != null && onChange(prev)}
            className="flex min-w-11 items-center justify-center px-2"
          >
            <Chevron />
          </Button>
          <Input
            type="date"
            aria-label="Tanggal data"
            aria-describedby={hintId}
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
            className="tabular-nums h-11 w-[9.25rem] shrink-0 cursor-pointer px-2 py-0"
          />
          <Button
            variant="rect"
            aria-label="Tanggal berikutnya"
            disabled={next == null}
            onClick={() => next != null && onChange(next)}
            className="flex min-w-11 items-center justify-center px-2"
          >
            <Chevron flipped />
          </Button>
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
      </div>
    </div>
  )
}
