import { cn } from "#/lib/utils.ts"

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
        className={cn("h-4 w-4 translate-y-px", flipped && "rotate-180")}
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  )
}
