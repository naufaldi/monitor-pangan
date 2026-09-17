import { useEffect, useId, useMemo, useRef, useState } from "react"

import { cn } from "#/lib/utils.ts"
import type { Commodity } from "#/data/catalog.ts"

type CommoditySelectProps = {
  commodities: Commodity[]
  value: string
  onChange: (id: string) => void
  /** Trailing preview text per commodity, e.g. the national average. */
  hintFor?: (commodity: Commodity) => string | undefined
}

/** Grouped commodity combobox with search. Scales past the tab strip. */
export function CommoditySelect({
  commodities,
  value,
  onChange,
  hintFor,
}: CommoditySelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const active = commodities.find((c) => c.id === value) ?? commodities[0]

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current != null && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open ])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, Commodity[]>()
    for (const c of commodities) {
      if (q !== "" && !c.name.toLowerCase().includes(q)) continue
      const list = map.get(c.group)
      if (list) list.push(c)
      else map.set(c.group, [c])
    }
    return [...map.entries()]
  }, [commodities, query])

  const matchCount = groups.reduce((sum, [, items]) => sum + items.length, 0)

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-xl border border-hairline bg-paper px-3 py-1.5 text-left",
          "transition-[scale,background-color,border-color] duration-150 ease-out active:scale-[0.96]",
        )}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-xs text-slate">Komoditas</span>
          <span className="truncate text-sm font-bold">{active?.name ?? "Pilih"}</span>
        </span>
        {active != null && hintFor != null ? (
          <span className="tabular-nums ml-auto shrink-0 text-sm font-semibold text-slate">
            {hintFor(active)}
          </span>
        ) : null}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-slate">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "h-4 w-4 translate-y-px transition-transform duration-150 ease-out",
              open && "rotate-180",
            )}
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-hairline bg-paper shadow-lg">
          <div className="border-b border-hairline p-2">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari komoditas…"
              aria-label="Cari komoditas"
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label="Komoditas"
            className="max-h-72 overflow-auto py-1"
          >
            {matchCount === 0 ? (
              <li className="px-4 py-3 text-sm text-slate">
                Tidak ada komoditas yang cocok.
              </li>
            ) : null}
            {groups.map(([group, items]) => (
              <li key={group}>
                <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase text-slate">
                  {group}
                </p>
                {items.map((c) => {
                  const selected = c.id === value
                  const hint = hintFor?.(c)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(c.id)
                        setOpen(false)
                        setQuery("")
                      }}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2 px-4 py-1.5 text-left",
                        "transition-[background-color] duration-150 ease-out",
                        selected ? "bg-ember-soft" : "hover:bg-muted",
                      )}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={cn(
                          "h-4 w-4 shrink-0",
                          selected ? "text-ember opacity-100" : "opacity-0",
                        )}
                      >
                        <path d="m3 8.5 3.5 3.5L13 4.5" />
                      </svg>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {c.name}
                      </span>
                      {hint != null ? (
                        <span className="tabular-nums shrink-0 text-sm text-slate">
                          {hint}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
