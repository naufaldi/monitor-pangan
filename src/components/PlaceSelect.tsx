import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Button, ChevronBadge, Input, fieldMenuClass, fieldTriggerClass } from "@monitor-pangan/ui"
import { PLACES, nearestPlace, type Place } from "#/data/places.ts"
import { cn } from "#/lib/utils.ts"

type PlaceSelectProps = {
  value: string
  onChange: (code: string) => void
}

const DENIED_COPY = "Izin lokasi ditolak. Pilih kota atau kabupaten."

/** Searchable kab/kota picker. Uses the shared input, not a second select primitive. */
export function PlaceSelect({ value, onChange }: PlaceSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const labelId = useId()
  const valueId = useId()
  const selected = PLACES.find((place) => place.code === value)

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === "") return PLACES.slice(0, 30)
    return PLACES.filter((place) => place.name.toLowerCase().includes(q) || place.code.includes(q)).slice(0, 30)
  }, [query])

  const useCurrentLocation = () => {
    if (locating) return
    if (typeof navigator === "undefined" || navigator.geolocation == null) {
      setLocationNote("Lokasi tidak tersedia di peramban ini.")
      return
    }
    setLocating(true)
    setLocationNote(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const place = nearestPlace(position.coords.latitude, position.coords.longitude)
        if (place == null) {
          onChange("")
          setLocationNote("Tidak ada kota terdekat di daftar.")
          return
        }
        onChange(place.code)
        setLocationNote(null)
      },
      (error) => {
        setLocating(false)
        if (error.code === error.PERMISSION_DENIED) {
          onChange("")
          setLocationNote(DENIED_COPY)
          return
        }
        setLocationNote("Lokasi tidak terbaca. Pilih kota atau kabupaten.")
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={rootRef} className="relative flex flex-col gap-1">
        <span id={labelId} className="text-sm text-slate">
          Kota atau kabupaten
        </span>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${labelId} ${valueId}`}
          onClick={() => setOpen((current) => !current)}
          className={fieldTriggerClass()}
        >
          <span id={valueId} className={cn("min-w-0 flex-1 truncate", selected == null && "font-medium text-slate")}>
            {selected?.name ?? "Pilih tempat"}
          </span>
          <ChevronBadge flipped={open} />
        </button>
        {open ? (
          <div className={fieldMenuClass()}>
            <div className="border-b border-hairline p-2">
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari kota atau kabupaten…"
                aria-label="Cari kota atau kabupaten"
                className="h-11 w-full py-0"
              />
            </div>
            <ul id={listId} role="listbox" aria-label="Kota atau kabupaten" className="max-h-72 overflow-auto py-1">
              {matches.length === 0 ? <li className="px-3 py-3 text-sm text-slate">Tidak ada tempat yang cocok.</li> : null}
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
      <Button
        type="button"
        variant="rect"
        disabled={locating}
        onClick={useCurrentLocation}
        className="self-start disabled:cursor-not-allowed disabled:opacity-40"
      >
        {locating ? "Mencari lokasi…" : "Gunakan lokasi saat ini"}
      </Button>
      {locationNote != null ? (
        <p role="status" className="text-sm text-slate">
          {locationNote}
        </p>
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
        className={cn(
          "flex h-11 w-full items-center px-3 text-left text-sm",
          selected ? "bg-ember-soft" : "hover:bg-muted",
        )}
      >
        {place.name}
      </button>
    </li>
  )
}
