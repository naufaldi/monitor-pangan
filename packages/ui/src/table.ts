import { cn } from "./primitives.tsx"

export type CellAlign = "start" | "end"

export const tableClass = "w-full border-separate border-spacing-0 text-left text-sm"

/** Header cell. `end` is for numeric columns. */
export function thClass(align: CellAlign = "start", className?: string): string {
  return cn(
    "border-b border-hairline bg-muted px-4 py-2 text-xs font-semibold whitespace-nowrap text-slate",
    align === "end" ? "text-right" : "text-left",
    className,
  )
}

/** Body cell. `end` cells are numeric: tabular, right-aligned, never wrapped. */
export function tdClass(align: CellAlign = "start", className?: string): string {
  return cn(
    "border-b border-hairline px-4 py-2",
    align === "end" ? "tabular-nums text-right whitespace-nowrap" : "text-left",
    className,
  )
}
