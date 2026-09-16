import { formatPct, formatPrice } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"
import type { PriceUnit } from "#/data/catalog.ts"
import type { TrendDirection } from "#/data/provider.ts"

export type MoverItem = {
  commodityId: string
  name: string
  unit: PriceUnit
  lastPrice: number
  changePct: number
  direction: TrendDirection
}

type MoversListProps = {
  items: MoverItem[]
  activeId: string
  onSelect: (id: string) => void
}

/** National 14-16 Sep movers, grouped by direction and sorted by changePct. */
export function MoversList({ items, activeId, onSelect }: MoversListProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-hairline bg-paper">
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="text-base font-bold">Pergerakan 14-16 Sep</h2>
          <p className="text-sm text-slate">Nasional, sorted by changePct</p>
        </div>
        <p className="px-4 py-3 text-sm text-slate">Belum ada data.</p>
      </section>
    )
  }

  const up = items
    .filter((item) => item.direction === "up")
    .sort((a, b) => b.changePct - a.changePct)
  const down = items
    .filter((item) => item.direction === "down")
    .sort((a, b) => a.changePct - b.changePct)
  const flat = items.filter((item) => item.direction === "flat")

  const groups: Array<{ title: string; rows: MoverItem[] }> = [
    { title: "Naik", rows: up },
    { title: "Turun", rows: down },
  ]
  if (flat.length > 0) groups.push({ title: "Stabil", rows: flat })

  return (
    <section className="rounded-xl border border-hairline bg-paper">
      <div className="border-b border-hairline px-4 py-3">
        <h2 className="text-base font-bold">Pergerakan 14-16 Sep</h2>
        <p className="text-sm text-slate">Nasional, sorted by changePct</p>
      </div>
      {groups.map((group) =>
        group.rows.length === 0 ? null : (
          <div key={group.title} className="border-b border-hairline last:border-b-0">
            <h3 className="px-4 pt-3 text-xs font-semibold uppercase text-slate">
              {group.title}
            </h3>
            <ul>
              {group.rows.map((item) => {
                const active = item.commodityId === activeId
                return (
                  <li key={item.commodityId}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.commodityId)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-2 text-left tabular-nums",
                        active && "bg-ember-soft",
                      )}
                    >
                      <span className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-sm text-slate">
                          {formatPrice(item.lastPrice, item.unit)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          item.direction === "up" && "text-ember",
                          item.direction === "down" && "text-leaf-deep",
                          item.direction === "flat" && "text-slate",
                        )}
                      >
                        {item.direction === "up" ? "▲ " : null}
                        {item.direction === "down" ? "▼ " : null}
                        {item.direction === "flat" ? "• " : null}
                        {formatPct(item.changePct)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ),
      )}
    </section>
  )
}
