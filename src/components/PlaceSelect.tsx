import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Input, cardClass } from "@monitor-pangan/ui"
import { PLACES, type Place } from "#/data/places.ts"
import { cn } from "#/lib/utils.ts"

type PlaceSelectProps = {
  value: string
  onChange: (code: string) => void
}

/** Searchable kab/kota picker. Uses the shared input, not a second select primitive. */
export function PlaceSelect({ value, onChange }: PlaceSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()
  const selected = PLACES.find((place) => place.code === value)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === "") return PLACES.slice(0, 30)
    return PLACES.filter((place) => place.name.toLowerCase().includes(q) || place.code.includes(q)).slice(0, 30)
  }, [query])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={cardClass("none", "flex min-h-11 w-full items-center px-3 py-1.5 text-left")}
      >
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-xs text-slate">Kota atau kabupaten</span>
          <span className="truncate text-sm font-bold">{selected?.name ?? "Pilih tempat"}</span>
        </span>
      </button>
      {open ? (
        <div className={cardClass("none", "absolute inset-x-0 top-full z-20 mt-1 overflow-hidden")}>
          <div className="border-b border-hairline p-2">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari kota atau kabupaten…"
              aria-label="Cari kota atau kabupaten"
              className="min-h-11 w-full"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Kota atau kabupaten" className="max-h-72 overflow-auto py-1">
            {matches.length === 0 ? <li className="px-4 py-3 text-sm text-slate">Tidak ada tempat yang cocok.</li> : null}
            {matches.map((place) => (
              <PlaceOption
                key={place.code}
                place={place}
                selected={place.code === value}
                onPick={() => {
                  onChange(place.code)
                  setOpen(false)
                  setQuery("")
                }}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function PlaceOption({ place, selected, onPick }: { place: Place; selected: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onPick}
        className={cn("flex min-h-11 w-full items-center px-4 text-left text-sm", selected ? "bg-muted" : "")}
      >
        {place.name}
      </button>
    </li>
  )
}
