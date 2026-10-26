import { Delta, Panel, StatusMessage, cn, eyebrowClass, focusRing, selectedRowClass } from "@monitor-pangan/ui"
import { formatPct, formatPrice, formatSeriesDate } from "#/lib/format.ts"
import type { MoverItem } from "#/lib/movers.ts"

type MoversListProps = {
  items: MoverItem[]
  activeId: string
  onSelect: (id: string) => void
  rangeLabel: string
  scopeLabel: string
  aggregationLabel: string
  totalCount: number
}

/** Only observed comparisons are ranked; every row names its effective endpoints. */
export function MoversList({ items, activeId, onSelect, rangeLabel, scopeLabel, aggregationLabel, totalCount }: MoversListProps) {
  const description = `${scopeLabel} · ${aggregationLabel}. Observasi tersedia dalam rentang dipilih; urut dari perubahan terbesar. ${totalCount - items.length} komoditas belum memiliki dua observasi yang dapat dibandingkan.`
  if (items.length === 0) {
    return (
      <Panel title={`Pergerakan ${rangeLabel}`} description={description}>
        <StatusMessage tone="empty" title="Cakupan belum cukup" bare>Perlu setidaknya dua observasi untuk menghitung perubahan pada wilayah dan rentang ini.</StatusMessage>
      </Panel>
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
    <Panel title={`Pergerakan ${rangeLabel}`} description={description}>
      {groups.map((group) =>
        group.rows.length === 0 ? null : (
          <div key={group.title} className="border-b border-hairline last:border-b-0">
            <h3 className={cn(eyebrowClass, "px-4 pt-3")}>
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
                        "flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-left tabular-nums hover:bg-muted",
                        focusRing,
                        "focus-visible:outline-offset-[-2px]",
                        active && selectedRowClass,
                      )}
                    >
                      <span className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-sm text-slate">
                          {formatPrice(item.lastPrice, item.unit)}
                        </span>
                        <span className="text-xs text-slate">{formatSeriesDate(item.from, item.resolution)} – {formatSeriesDate(item.to, item.resolution)}</span>
                      </span>
                      <Delta direction={item.direction} className="shrink-0 whitespace-nowrap text-sm">
                        {formatPct(item.changePct)}
                      </Delta>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ),
      )}
    </Panel>
  )
}
