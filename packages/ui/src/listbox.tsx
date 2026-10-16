import type { ReactNode, Ref } from "react"
import { selectedRowClass } from "./layout.tsx"
import { Input, cn } from "./primitives.tsx"

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
      <SearchInput {...props} />
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
    <ul id={id} role="listbox" aria-label={label} className="max-h-72 overflow-auto py-1">
      {children}
    </ul>
  )
}

export function listboxOptionClass(selected: boolean): string {
  return cn(
    "flex h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium",
    "transition-[background-color] duration-150 ease-out",
    selected ? selectedRowClass : "hover:bg-muted",
  )
}

type ListboxOptionProps = {
  selected: boolean
  onSelect: () => void
  /** Right-aligned secondary text, e.g. a price hint. */
  trailing?: ReactNode
  children: ReactNode
}

/** One row in a field menu. Renders its own <li>. */
export function ListboxOption({ selected, onSelect, trailing, children }: ListboxOptionProps) {
  return (
    <li>
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
        {trailing != null ? <span className="tabular-nums shrink-0 font-normal text-slate">{trailing}</span> : null}
      </button>
    </li>
  )
}

/** Group heading inside a Listbox. Wrap the group's options in the returned <li>'s <ul>. */
export function ListboxGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li>
      <p className="px-4 pt-2 pb-1 text-xs font-semibold text-slate">{label}</p>
      <ul>{children}</ul>
    </li>
  )
}

export function ListboxEmpty({ children }: { children: ReactNode }) {
  return <li className="px-4 py-3 text-sm text-slate">{children}</li>
}
