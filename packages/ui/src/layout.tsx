import type { ReactNode } from "react"
import { cn } from "./primitives.tsx"

/** Main column for every route. */
export const pageShellClass = "mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4"

/** Sticky filter bar under the header. Sits above table sticky headers. */
export const stickyToolbarClass =
  "sticky top-0 z-(--z-toolbar) -mx-4 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur"

/** Small label above a value or a card body. */
export const eyebrowClass = "text-xs font-semibold text-slate"

/** Selected list or table row. Neutral, never a data color. */
export const selectedRowClass = "bg-selected shadow-[inset_3px_0_0_var(--color-ink)] hover:bg-selected"

type PageHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** Toolbar-first pages keep the heading for screen readers only. */
  visuallyHidden?: boolean
}

/** One h2 per route, the same size everywhere. */
export function PageHeader({ title, description, actions, visuallyHidden = false }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-3", visuallyHidden && "sr-only")}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {description != null ? <p className="text-sm text-slate">{description}</p> : null}
      </div>
      {actions}
    </header>
  )
}

type SectionHeaderProps = {
  title: ReactNode
  description?: ReactNode
  className?: string
}

/** Heading for a card or section inside a page. */
export function SectionHeader({ title, description, className }: SectionHeaderProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <h2 className="text-base font-bold">{title}</h2>
      {description != null ? <p className="text-sm text-slate">{description}</p> : null}
    </div>
  )
}
