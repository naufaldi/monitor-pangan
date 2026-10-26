import { useId, useState, type ReactNode, type SelectHTMLAttributes } from "react"
import { Input, Select, buttonClass, cardClass, cn, focusRing, type InputProps } from "./primitives.tsx"

type FieldInputProps = InputProps & {
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  /** Short fixed text inside the field before the value, such as a currency. */
  leading?: string
  wrapperClassName?: string
}

/** Keep the visible label and validation feedback connected to the input. */
export function FieldInput({ label, hideLabel = false, hint, error, leading, wrapperClassName, id, className, ...rest }: FieldInputProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const description = [rest["aria-describedby"], hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null].filter(Boolean).join(" ") || undefined
  return <div className={cn("flex flex-col gap-1", wrapperClassName)}>
    <label htmlFor={fieldId} className={cn("text-sm text-slate", hideLabel && "sr-only")}>{label}</label>
    {leading == null
      ? <Input {...rest} id={fieldId} className={className} aria-describedby={description} aria-invalid={error ? true : rest["aria-invalid"]} />
      : <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-ink">{leading}</span>
        <Input {...rest} id={fieldId} className={cn("h-11 w-full py-0 pr-3 pl-10", className)} aria-describedby={description} aria-invalid={error ? true : rest["aria-invalid"]} />
      </div>}
    {hint ? <p id={`${fieldId}-hint`} className="text-xs text-slate">{hint}</p> : null}
    {error ? <p id={`${fieldId}-error`} className="text-xs text-ember">{error}</p> : null}
  </div>
}

const press =
  "transition-[scale,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

/** Padded chevron badge used as a select affordance. */
export function ChevronBadge({ flipped }: { flipped?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-slate"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "h-4 w-4 translate-y-px transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          flipped && "rotate-180",
        )}
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  )
}

/** Single-line combobox trigger. Same height, radius and border as Input and Select. */
export function fieldTriggerClass(className?: string): string {
  return cn(
    "flex h-11 w-full items-center gap-2 rounded-lg border border-hairline bg-paper pr-1.5 pl-3 text-left text-sm font-semibold text-ink aria-invalid:border-ember",
    focusRing,
    press,
    className,
  )
}

/** Menu under a field trigger. It scales from the trigger, not from the center of the screen. */
export function fieldMenuClass(className?: string): string {
  return cardClass(
    "none",
    cn(
      "absolute inset-x-0 top-full z-(--z-menu) mt-1 origin-top overflow-hidden shadow-lg",
      "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:scale-95 starting:opacity-0",
      "motion-reduce:transition-none motion-reduce:starting:scale-100",
      className,
    ),
  )
}

type FieldSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  /** Keep the label for screen readers only, for dense toolbars. */
  hideLabel?: boolean
  wrapperClassName?: string
  children: ReactNode
}

/** Native select with the same chrome as the combobox trigger. The only select wrapper in the app. */
export function FieldSelect({ label, hideLabel = false, className, wrapperClassName, id, children, ...rest }: FieldSelectProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className={cn("flex flex-col gap-1", wrapperClassName)}>
      <label htmlFor={fieldId} className={cn("text-sm text-slate", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        <Select id={fieldId} className={cn("h-11 w-full appearance-none py-0 pr-12 pl-3 text-ink", className)} {...rest}>
          {children}
        </Select>
        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">
          <ChevronBadge />
        </span>
      </div>
    </div>
  )
}

type FileInputProps = {
  label: string
  accept?: string
  onFile: (file: File | null) => void
}

/** File picker styled as a rect button plus the chosen file name. The native input stays focusable. */
export function FileInput({ label, accept, onFile }: FileInputProps) {
  const [name, setName] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate">{label}</span>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring rounded-lg",
        )}
      >
        <input
          type="file"
          accept={accept}
          aria-label={label}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            setName(file?.name ?? null)
            onFile(file)
          }}
        />
        <span className={buttonClass("rect", false, "inline-flex items-center")}>Pilih foto</span>
        <span className="min-w-0 truncate text-slate">{name ?? "Belum ada foto"}</span>
      </label>
    </div>
  )
}
