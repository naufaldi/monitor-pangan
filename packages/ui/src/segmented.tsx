import { Button, cn } from "./primitives.tsx"

export type SegmentedOption<T extends string> = { value: T; label: string }

type SegmentedControlProps<T extends string> = {
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  itemClassName?: string
}

/** One-of-N toggle. Active option is ink, like every other selected control. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className, itemClassName }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Button
            key={option.value}
            variant="rect"
            active={active}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={itemClassName}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
