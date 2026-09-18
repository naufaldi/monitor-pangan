import { useRef } from "react"
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet"
import type { Layer, Path } from "leaflet"
import "leaflet/dist/leaflet.css"
import { cardClass } from "@monitor-pangan/ui"
import { provinceFeatures } from "#/data/geo.ts"
import type { PriceRow } from "#/data/provider.ts"

const STOPS = [
  { below: 0.9, color: "#00714c", label: "Jauh di bawah rata-rata" },
  { below: 0.97, color: "#00bd7d", label: "Di bawah rata-rata" },
  { below: 1.03, color: "#eab308", label: "Sekitar rata-rata" },
  { below: 1.1, color: "#f97316", label: "Di atas rata-rata" },
  { below: Number.POSITIVE_INFINITY, color: "#dc2626", label: "Jauh di atas rata-rata" },
]

function colorFor(price: number, average: number): string {
  const ratio = average === 0 ? 1 : price / average
  return STOPS.find((s) => ratio < s.below)?.color ?? "#eab308"
}

type MapViewProps = {
  snapshotKey: string
  prices: PriceRow[]
  average: number
  selectedCode: string | null
  onSelect: (code: string) => void
}

/** Province choropleth colored by price vs the national average. */
export function MapView({
  snapshotKey,
  prices,
  average,
  selectedCode,
  onSelect,
}: MapViewProps) {
  const byCode = new Map(prices.map((r) => [r.regionCode, r.price]))
  const selectedRef = useRef(selectedCode)
  selectedRef.current = selectedCode

  return (
    <div className={cardClass("none", "overflow-hidden")}>
      <MapContainer
        center={[-2.6, 118]}
        zoom={5}
        scrollWheelZoom={false}
        className="z-0 h-[420px] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON
          key={snapshotKey}
          data={provinceFeatures() as never}
          style={(feature) => {
            const code = feature?.properties["code"] as string | undefined
            const price = code != null ? byCode.get(code) : undefined
            const selected = code === selectedCode
            const missing = price == null
            return {
              fillColor: missing ? "#e4e6df" : colorFor(price, average),
              fillOpacity: missing ? 0.35 : 0.65,
              color: selected ? "#1a1c16" : "#ffffff",
              weight: selected ? 2 : 1,
            }
          }}
          onEachFeature={(feature, layer: Layer) => {
            const code = feature?.properties["code"] as string | undefined
            const name = feature?.properties["name"] as string | undefined
            if (code == null) return
            const path = layer as Path
            layer.on("click", () => onSelect(code))
            layer.on("mouseover", () => {
              path.setStyle({ weight: 2, color: "#1a1c16" })
            })
            layer.on("mouseout", () => {
              const selected = selectedRef.current === code
              path.setStyle({
                weight: selected ? 2 : 1,
                color: selected ? "#1a1c16" : "#ffffff",
              })
            })
            const price = byCode.get(code)
            layer.bindTooltip(
              price == null ? `${name ?? code} · tidak ada data` : (name ?? code),
              { sticky: true },
            )
          }}
        />
      </MapContainer>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline px-4 py-2 text-xs text-slate">
        {STOPS.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-hairline" />
          Tidak ada data
        </li>
      </ul>
    </div>
  )
}
