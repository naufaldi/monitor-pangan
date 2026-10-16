import type { ReactNode } from "react"
import { cardClass, cn } from "./primitives.tsx"

export type StatusTone = "empty" | "error" | "loading"

type StatusMessageProps = {
  tone: StatusTone
  title: string
  children?: ReactNode
  action?: ReactNode
  /** Render inside an existing card without a second border. */
  bare?: boolean
  className?: string
}

function toneRole(tone: StatusTone): "status" | "alert" {
  switch (tone) {
    case "empty":
    case "loading":
      return "status"
    case "error":
      return "alert"
    default: {
      const _exhaustive: never = tone
      return _exhaustive
    }
  }
}

/** The single empty / error / loading block. Errors use ember text, never an ember fill. */
export function StatusMessage({ tone, title, children, action, bare = false, className }: StatusMessageProps) {
  return (
    <div
      role={toneRole(tone)}
      aria-busy={tone === "loading" || undefined}
      className={cn(bare ? "px-4 py-6" : cardClass("md"), "flex flex-col items-start gap-2 text-sm", className)}
    >
      <p className={cn("font-semibold", tone === "error" ? "text-ember" : "text-ink")}>{title}</p>
      {children != null ? <div className="text-slate">{children}</div> : null}
      {action}
    </div>
  )
}
