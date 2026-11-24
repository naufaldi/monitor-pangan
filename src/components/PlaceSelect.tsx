import { useId, useMemo, useRef, useState } from "react"
import { Button, ChevronBadge, Listbox, ListboxDisclosure, ListboxEmpty, ListboxOption, ListboxSearch, StatusMessage, cn, fieldTriggerClass, useListboxDisclosure } from "@monitor-pangan/ui"
import { PLACES, nearestPlace } from "#/data/places.ts"

type PlaceSelectProps = {
  value: string
  onChange: (code: string) => void
  /** Validation message from the form; marks the trigger invalid and describes it. */
  error?: string
  /** Id of the trigger button, so the form can move focus to it. */
  id?: string
}

const DENIED_COPY = "Izin lokasi ditolak. Pilih kota atau kabupaten."

/** Searchable kab/kota picker. Uses the shared input, not a second select primitive. */
export function PlaceSelect({ value, onChange, error, id }: PlaceSelectProps) {
  const { open, query, setQuery, rootRef, triggerRef, searchRef, toggle, close } = useListboxDisclosure()
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState<string | null>(null)
  const locationRequest = useRef(0)
  const listId = useId()
  const labelId = useId()
  const valueId = useId()
  const errorId = useId()
  const selected = PLACES.find((place) => place.code === value)

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
    const request = ++locationRequest.current
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return
        setLocating(false)
        const place = nearestPlace(position.coords.latitude, position.coords.longitude)
        if (place == null) {
          setLocationNote("Tidak ada kota terdekat di daftar.")
          return
        }
        onChange(place.code)
        setLocationNote(null)
      },
      (error) => {
        if (request !== locationRequest.current) return
        setLocating(false)
        if (error.code === error.PERMISSION_DENIED) {
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
          ref={triggerRef}
          id={id}
          type="button"
          aria-invalid={error != null ? true : undefined}
          aria-describedby={error != null ? errorId : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${labelId} ${valueId}`}
          onClick={toggle}
          className={fieldTriggerClass()}
        >
          <span id={valueId} className={cn("min-w-0 flex-1 truncate", selected == null && "font-medium text-slate")}>
            {selected?.name ?? "Pilih tempat"}
          </span>
          <ChevronBadge flipped={open} />
        </button>
        <ListboxDisclosure open={open}>
          <ListboxSearch
            ref={searchRef}
            label="Cari kota atau kabupaten"
            value={query}
            onValueChange={setQuery}
            placeholder="Cari kota atau kabupaten…"
          />
          <Listbox id={listId} label="Kota atau kabupaten">
            {matches.length === 0 ? <ListboxEmpty>Tidak ada tempat yang cocok.</ListboxEmpty> : null}
            {matches.map((place) => (
              <ListboxOption
                key={place.code}
                selected={place.code === value}
                onSelect={() => {
                  locationRequest.current++
                  setLocating(false)
                  setLocationNote(null)
                  close()
                  onChange(place.code)
                }}
              >
                {place.name}
              </ListboxOption>
            ))}
          </Listbox>
        </ListboxDisclosure>
        {error != null ? <p id={errorId} className="text-xs text-ember">{error}</p> : null}
      </div>
      <Button
        type="button"
        variant="rect"
        disabled={locating}
        onClick={useCurrentLocation}
        className="self-start"
      >
        {locating ? "Mencari lokasi…" : "Gunakan lokasi saat ini"}
      </Button>
      {locationNote != null ? (
        <StatusMessage tone="empty" title={locationNote} bare className="px-0 py-0" />
      ) : null}
    </div>
  )
}
