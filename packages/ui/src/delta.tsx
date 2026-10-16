import type { ReactNode } from "react"
import { cn } from "./primitives.tsx"

/** Price movement direction. Structurally equal to the app's TrendDirection. */
export type Direction = "up" | "down" | "flat"

export function directionGlyph(direction: Direction): string {
  switch (direction) {
    case "up":
      return "▲"
    case "down":
      return "▼"
    case "flat":
      return "•"
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

/** A rising food price is bad news (ember), a falling one is good news (leaf-deep). */
export function directionTextClass(direction: Direction): string {
  switch (direction) {
    case "up":
      return "text-ember"
    case "down":
      return "text-leaf-deep"
    case "flat":
      return "text-slate"
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

type DeltaProps = {
  direction: Direction
  /** Already formatted text, e.g. formatPct(x) or "+44,7% · Rp1.200/kg". */
  children: ReactNode
  className?: string
}

/** Colored glyph plus value. The only way to show a price change. */
export function Delta({ direction, children, className }: DeltaProps) {
  return (
    <span className={cn("tabular-nums font-semibold", directionTextClass(direction), className)}>
      <span aria-hidden="true">{directionGlyph(direction)} </span>
      {children}
    </span>
  )
}
