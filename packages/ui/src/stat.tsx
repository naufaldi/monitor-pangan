import type { ReactNode } from "react"
import { eyebrowClass } from "./layout.tsx"
import { cn } from "./primitives.tsx"

type StatListProps = {
  /** 3 = 2 cols on mobile, 3 from sm. 4 = 2 cols on mobile, 4 from lg. */
  columns?: 3 | 4
  className?: string
  children: ReactNode
}

export function StatList({ columns = 4, className, children }: StatListProps) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3", columns === 3 ? "sm:grid-cols-3" : "lg:grid-cols-4", className)}>
      {children}
    </dl>
  )
}

type StatProps = {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** Accent bar on the left, e.g. the lowest affordability. */
  accent?: "ember" | "leaf-deep"
}

/** One label / value / hint triple inside a StatList. */
export function Stat({ label, value, hint, accent }: StatProps) {
  return (
    <div className={cn(accent != null && "relative pl-3")}>
      {accent != null ? (
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 w-0.5", accent === "ember" ? "bg-ember" : "bg-leaf-deep")}
        />
      ) : null}
      <dt className={eyebrowClass}>{label}</dt>
      <dd className="tabular-nums text-sm font-bold text-ink">{value}</dd>
      {hint != null ? <dd className="tabular-nums mt-0.5 text-xs text-slate">{hint}</dd> : null}
    </div>
  )
}
