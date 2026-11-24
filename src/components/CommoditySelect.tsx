import { useId, useMemo } from "react"
import { ChevronBadge, Listbox, ListboxDisclosure, ListboxEmpty, ListboxGroup, ListboxOption, ListboxSearch, fieldTriggerClass, useListboxDisclosure } from "@monitor-pangan/ui"
import type { Commodity } from "#/data/catalog.ts"

type CommoditySelectProps = {
  commodities: Commodity[]
  value: string
  onChange: (id: string) => void
  /** Empty value means every commodity. Existing callers keep a selected commodity. */
  allowEmpty?: boolean
}

/** Grouped commodity combobox with search. Scales past the tab strip. */
export function CommoditySelect({
  commodities,
  value,
  onChange,
  allowEmpty = false,
}: CommoditySelectProps) {
  const { open, query, setQuery, rootRef, triggerRef, searchRef, toggle, close } = useListboxDisclosure()
  const listId = useId()
  const labelId = useId()
  const valueId = useId()
  const active = commodities.find((c) => c.id === value) ?? (allowEmpty ? undefined : commodities[0])

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
    close()
    onChange(id)
  }

  return (
    <div ref={rootRef} className="relative flex w-full flex-col gap-1">
      <span id={labelId} className="text-sm text-slate">
        Komoditas
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={toggle}
        className={fieldTriggerClass()}
      >
        <span id={valueId} className="min-w-0 flex-1 truncate">
          {valueLabel}
        </span>
        <ChevronBadge flipped={open} />
      </button>

      <ListboxDisclosure open={open}>
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
                <ListboxOption key={c.id} selected={c.id === active?.id} onSelect={() => pick(c.id)}>
                  {c.name}
                </ListboxOption>
              ))}
            </ListboxGroup>
          ))}
        </Listbox>
      </ListboxDisclosure>
    </div>
  )
}
