import type { ReactNode } from "react"
import { SectionHeader } from "./layout.tsx"
import { cardClass, cn } from "./primitives.tsx"

type PanelProps = {
  title: ReactNode
  description?: ReactNode
  /** Controls on the right of the header (search, sort). They stack under the title on mobile. */
  toolbar?: ReactNode
  /** Full-width row under the title and toolbar, e.g. a legend. */
  headerExtra?: ReactNode
  /** Dims the panel and sets aria-busy while data reloads. */
  busy?: boolean
  "aria-label"?: string
  className?: string
  children: ReactNode
}

/** Card section with a header bar. Use for every table or list block. */
export function Panel({ title, description, toolbar, headerExtra, busy = false, className, children, ...rest }: PanelProps) {
  return (
    <section
      aria-label={rest["aria-label"]}
      aria-busy={busy || undefined}
      className={cardClass("none", cn("overflow-hidden", busy && "opacity-70", className))}
    >
      <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <SectionHeader title={title} description={description} />
          {toolbar != null ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{toolbar}</div>
          ) : null}
        </div>
        {headerExtra}
      </div>
      {children}
    </section>
  )
}
