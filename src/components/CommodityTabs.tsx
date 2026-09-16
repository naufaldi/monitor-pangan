import { cn } from "#/lib/utils.ts"
import type { Commodity } from "#/data/catalog.ts"

type CommodityTabsProps = {
  commodities: Commodity[]
  value: string
  onChange: (id: string) => void
}

/** Scrollable commodity switcher. */
export function CommodityTabs({ commodities, value, onChange }: CommodityTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Komoditas"
      className="filmstrip flex snap-x gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_92%,transparent)]"
    >
      {commodities.map((c) => (
        <button
          key={c.id}
          role="tab"
          aria-selected={c.id === value}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "min-h-11 shrink-0 snap-start rounded-full border px-4 py-2 text-sm font-semibold transition-transform active:scale-[0.96]",
            c.id === value
              ? "border-ink bg-ink text-white"
              : "border-hairline bg-paper text-ink",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
