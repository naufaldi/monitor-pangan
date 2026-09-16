import { formatDateShort } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"

type DatePickerProps = {
  dates: string[]
  value: string
  onChange: (date: string) => void
}

/** Snapshot switcher over the available trading-day dates. */
export function DatePicker({ dates, value, onChange }: DatePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {dates.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={d === value}
          className={cn(
            "tabular-nums rounded-lg border px-3 py-1.5 text-sm font-semibold",
            d === value
              ? "border-ink bg-ink text-white"
              : "border-hairline bg-paper text-ink",
          )}
        >
          {formatDateShort(d)}
        </button>
      ))}
      <span className="text-xs text-slate">Hari perdagangan (Senin–Jumat)</span>
    </div>
  )
}
