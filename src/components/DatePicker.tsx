import { Button } from "@monitor-pangan/ui"
import { formatDateShort } from "#/lib/format.ts"

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
        <Button
          key={d}
          variant="rect"
          active={d === value}
          onClick={() => onChange(d)}
          aria-pressed={d === value}
        >
          {formatDateShort(d)}
        </Button>
      ))}
      <span className="text-xs text-slate">Hari perdagangan (Senin–Jumat)</span>
    </div>
  )
}
