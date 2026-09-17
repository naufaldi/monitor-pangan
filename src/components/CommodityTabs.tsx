import { useEffect, useRef } from "react"
import { buttonClass } from "@monitor-pangan/ui"
import type { Commodity } from "#/data/catalog.ts"

type CommodityTabsProps = {
  commodities: Commodity[]
  value: string
  onChange: (id: string) => void
}

/** Scrollable commodity switcher. */
export function CommodityTabs({ commodities, value, onChange }: CommodityTabsProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [value])
  return (
    <div
      role="tablist"
      aria-label="Komoditas"
      className="filmstrip flex snap-x gap-2 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
    >
      {commodities.map((c) => (
        <button
          key={c.id}
          ref={c.id === value ? activeRef : undefined}
          role="tab"
          aria-selected={c.id === value}
          type="button"
          onClick={() => onChange(c.id)}
          className={buttonClass("pill", c.id === value, "shrink-0 snap-start")}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
