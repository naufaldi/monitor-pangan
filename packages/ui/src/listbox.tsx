import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { rowActionClass, selectedRowClass } from "./layout.tsx"
import { Input, cardClass, cn } from "./primitives.tsx"

/** Open state owns search and focus; outside dismissal leaves focus at its destination. */
export function useListboxDisclosure() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (!window.matchMedia("(pointer: coarse)").matches) searchRef.current?.focus({ preventScroll: true })
    const dismissOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const dismissOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      triggerRef.current?.focus({ preventScroll: true })
      setOpen(false)
    }
    document.addEventListener("pointerdown", dismissOutside)
    document.addEventListener("focusin", dismissOutside)
    document.addEventListener("keydown", dismissOnEscape)
    return () => {
      document.removeEventListener("pointerdown", dismissOutside)
      document.removeEventListener("focusin", dismissOutside)
      document.removeEventListener("keydown", dismissOnEscape)
    }
  }, [open])

  const toggle = () => {
    if (!open) setQuery("")
    setOpen(!open)
  }
  const close = () => {
    triggerRef.current?.focus({ preventScroll: true })
    setOpen(false)
  }

  return { open, query, setQuery, rootRef, triggerRef, searchRef, toggle, close }
}

export function ListboxDisclosure({ open, children }: { open: boolean; children: ReactNode }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    if (options.length === 0) return
    const index = options.findIndex((option) => option === event.target)
    const next = event.key === "ArrowDown" ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1)
    event.preventDefault()
    options[next]?.focus()
  }

  return (
    <div
      data-closed={open ? undefined : ""}
      inert={!open}
      onKeyDown={onKeyDown}
      className={cardClass("none", cn(
        "absolute inset-x-0 top-full z-(--z-menu) mt-1 overflow-hidden shadow-lg",
        "data-closed:hidden data-closed:-translate-y-1 data-closed:opacity-0 starting:-translate-y-1 starting:opacity-0",
        "transition-[opacity,translate,display] transition-discrete duration-(--duration-reveal) ease-reveal data-closed:duration-(--duration-dismiss) data-closed:ease-control",
        "motion-reduce:transition-none",
      ))}
    >
      {children}
    </div>
  )
}

type SearchInputProps = {
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  ref?: Ref<HTMLInputElement>
}

/** The one search box. `label` is the accessible name. */
export function SearchInput({ label, value, onValueChange, placeholder, className, ref }: SearchInputProps) {
  return (
    <Input
      ref={ref}
      type="search"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className={cn("w-full", className)}
    />
  )
}

/** Search box pinned at the top of a field menu. */
export function ListboxSearch(props: SearchInputProps) {
  return (
    <div className="border-b border-hairline p-2">
      <SearchInput {...props} className={cn("text-base md:text-sm", props.className)} />
    </div>
  )
}

type ListboxProps = {
  id: string
  label: string
  children: ReactNode
}

export function Listbox({ id, label, children }: ListboxProps) {
  return (
    <ul id={id} role="listbox" aria-label={label} className="max-h-[min(18rem,42dvh)] overflow-auto py-1">
      {children}
    </ul>
  )
}

export function listboxOptionClass(selected: boolean): string {
  return cn(
    "flex h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium",
    rowActionClass,
    selected && selectedRowClass,
  )
}

type ListboxOptionProps = {
  selected: boolean
  onSelect: () => void
  children: ReactNode
}

/** One row in a field menu. Renders its own <li>. */
export function ListboxOption({ selected, onSelect, children }: ListboxOptionProps) {
  return (
    <li role="presentation">
      <button type="button" role="option" aria-selected={selected} onClick={onSelect} className={listboxOptionClass(selected)}>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("h-4 w-4 shrink-0 text-ink", selected ? "opacity-100" : "opacity-0")}
        >
          <path d="m3 8.5 3.5 3.5L13 4.5" />
        </svg>
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
    </li>
  )
}

/** Group heading inside a Listbox. Wrap the group's options in the returned <li>'s <ul>. */
export function ListboxGroup({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId()
  return (
    <li role="presentation">
      <p id={labelId} className="px-4 pt-2 pb-1 text-xs font-semibold text-slate">{label}</p>
      <ul role="group" aria-labelledby={labelId}>{children}</ul>
    </li>
  )
}

export function ListboxEmpty({ children }: { children: ReactNode }) {
  return <li role="presentation" className="px-4 py-3 text-sm text-slate">{children}</li>
}
