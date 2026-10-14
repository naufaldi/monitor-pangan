import { useId, type ReactNode, type SelectHTMLAttributes } from "react"
import { Select, cardClass } from "@monitor-pangan/ui"
import { ChevronBadge } from "#/components/ChevronBadge.tsx"
import { cn } from "#/lib/utils.ts"

const press =
  "transition-[scale,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

/** Single-line combobox trigger. The label sits above this control, and the chevron stays on the right. */
export function fieldTriggerClass(className?: string): string {
  return cardClass(
    "none",
    cn("flex h-11 w-full items-center gap-2 pr-1.5 pl-3 text-left text-sm font-semibold text-ink", press, className),
  )
}

/** Menu under a field trigger. It scales from the trigger, not from the center of the screen. */
export function fieldMenuClass(className?: string): string {
  return cardClass(
    "none",
    cn(
      "absolute inset-x-0 top-full z-20 mt-1 origin-top overflow-hidden shadow-lg",
      "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:scale-95 starting:opacity-0",
      "motion-reduce:transition-none motion-reduce:starting:scale-100",
      className,
    ),
  )
}

const nativeFieldClass =
  "h-11 w-full appearance-none rounded-xl border-hairline bg-paper py-0 pr-12 pl-3 text-sm font-semibold text-ink"

type FieldSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  children: ReactNode
}

/** Native select with the same single-line chrome as the combobox. Chevron sits on the right. */
export function FieldSelect({ label, className, id, children, ...rest }: FieldSelectProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm text-slate">
        {label}
      </label>
      <div className="relative">
        <Select id={fieldId} className={cn(nativeFieldClass, className)} {...rest}>
          {children}
        </Select>
        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">
          <ChevronBadge />
        </span>
      </div>
    </div>
  )
}
