import { useEffect, useId, useMemo, useRef, useState } from "react"
import { ChevronBadge, Listbox, ListboxEmpty, ListboxGroup, ListboxOption, ListboxSearch, fieldMenuClass, fieldTriggerClass } from "@monitor-pangan/ui"
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

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery("")
  }

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
          <ListboxSearch
            ref={searchRef}
            label="Cari komoditas"
            value={query}
            onValueChange={setQuery}
            placeholder="Cari komoditas…"
          />
          <Listbox id={listId} label="Komoditas">
            {allowEmpty ? (
              <ListboxOption selected={value === ""} onSelect={() => pick("")}>
                Semua komoditas
              </ListboxOption>
            ) : null}
            {matchCount === 0 ? <ListboxEmpty>Tidak ada komoditas yang cocok.</ListboxEmpty> : null}
            {groups.map(([group, items]) => (
              <ListboxGroup key={group} label={group}>
                {items.map((c) => (
                  <ListboxOption key={c.id} selected={c.id === value} onSelect={() => pick(c.id)} trailing={hintFor?.(c)}>
                    {c.name}
                  </ListboxOption>
                ))}
              </ListboxGroup>
            ))}
          </Listbox>
        </div>
      ) : null}
    </div>
  )
}
