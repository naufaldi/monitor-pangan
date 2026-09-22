import { useRef } from "react"
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet"
import type { Layer, Path } from "leaflet"
import "leaflet/dist/leaflet.css"
import { cardClass } from "@monitor-pangan/ui"
import { provinceFeatures } from "#/data/geo.ts"
import type { PriceRow } from "#/data/provider.ts"
import { PRICE_BANDS, provinceFill } from "#/lib/province-fill.ts"

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
            const fill = provinceFill(price, average)
            return {
              fillColor: fill.fillColor,
              fillOpacity: fill.fillOpacity,
              color: missing || !selected ? "#ffffff" : "#1a1c16",
              weight: selected ? 2.5 : 1,
            }
          }}
          onEachFeature={(feature, layer: Layer) => {
            const code = feature?.properties["code"] as string | undefined
            const name = feature?.properties["name"] as string | undefined
            if (code == null) return
            const path = layer as Path
            const missing = byCode.get(code) == null
            layer.on("click", () => onSelect(code))
            layer.on("mouseover", () => {
              path.setStyle({ weight: 2.5, color: missing ? "#ffffff" : "#1a1c16" })
            })
            layer.on("mouseout", () => {
              const selected = selectedRef.current === code
              path.setStyle({
                weight: selected ? 2.5 : 1,
                color: missing || !selected ? "#ffffff" : "#1a1c16",
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
        {PRICE_BANDS.map((band) => (
          <li key={band.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: band.color }}
            />
            {band.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-ink" />
          Tidak ada data
        </li>
      </ul>
    </div>
  )
}
