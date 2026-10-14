import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Input } from "@monitor-pangan/ui"
import { ChevronBadge } from "#/components/ChevronBadge.tsx"
import { fieldMenuClass, fieldTriggerClass } from "#/components/field-trigger.tsx"
import { cn } from "#/lib/utils.ts"
import type { Commodity } from "#/data/catalog.ts"

type CommoditySelectProps = {
  commodities: Commodity[]
  value: string
  onChange: (id: string) => void
  /** Trailing preview text per commodity, e.g. the national average. */
  hintFor?: (commodity: Commodity) => string | undefined
  /** Empty value means every commodity. Existing callers keep a selected commodity. */
  allowEmpty?: boolean
}

/** Grouped commodity combobox with search. Scales past the tab strip. */
export function CommoditySelect({
  commodities,
  value,
  onChange,
  hintFor,
  allowEmpty = false,
}: CommoditySelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const labelId = useId()
  const valueId = useId()
  const active = commodities.find((c) => c.id === value) ?? (allowEmpty ? undefined : commodities[0])

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

  const valueLabel = active?.name ?? (allowEmpty ? "Semua komoditas" : "Pilih")

  return (
    <div ref={rootRef} className="relative flex w-full flex-col gap-1">
      <span id={labelId} className="text-sm text-slate">
        Komoditas
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen((v) => !v)}
        className={fieldTriggerClass()}
      >
        <span id={valueId} className="min-w-0 flex-1 truncate">
          {valueLabel}
        </span>
        {active != null && hintFor != null ? (
          <span className="tabular-nums shrink-0 text-sm font-semibold text-slate">{hintFor(active)}</span>
        ) : null}
        <ChevronBadge flipped={open} />
      </button>

      {open ? (
        <div className={fieldMenuClass()}>
          <div className="border-b border-hairline p-2">
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari komoditas…"
              aria-label="Cari komoditas"
              className="h-11 w-full py-0"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label="Komoditas"
            className="max-h-72 overflow-auto py-1"
          >
            {allowEmpty ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ""}
                  onClick={() => {
                    onChange("")
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex h-11 w-full items-center px-3 text-left text-sm font-medium"
                >
                  Semua komoditas
                </button>
              </li>
            ) : null}
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
                        "flex h-11 w-full items-center gap-2 px-3 text-left",
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
