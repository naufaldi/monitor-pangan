import { useEffect, useMemo, useState } from "react"
import { GeoJSON, MapContainer, Marker, TileLayer } from "react-leaflet"
import { divIcon } from "leaflet"
import "leaflet/dist/leaflet.css"
import { Card, cardClass } from "@monitor-pangan/ui"
import { COMMODITIES } from "#/data/catalog.ts"
import { provinceFeatures } from "#/data/geo.ts"
import { CITY_MEDIAN_CAPTION, DITINJAU_COPY, PIN_COMMODITY_EMPTY, type PublicReport } from "#/data/laporan.ts"
import { ReportRow } from "#/components/LaporanList.tsx"
import { placeByCode } from "#/data/places.ts"
import { formatPrice } from "#/lib/format.ts"
import { cityMedian, pins, provinceOutline } from "#/lib/laporan.ts"

type LaporanMapProps = {
  rows: readonly PublicReport[]
  outlet: PublicReport["outlet"]
  commodityId: string | null
  onProvince: (code: string) => void
}

/** Neutral pins for reviewed reports. Province shapes stay unfilled. */
export function LaporanMap({ rows, outlet, commodityId, onProvince }: LaporanMapProps) {
  const ink = useTokenColor()
  const [selected, setSelected] = useState<string | null>(null)
  const markers = useMemo(() => pins(rows, outlet, commodityId), [rows, outlet, commodityId])
  const selectedRows = rows.filter((row) => row.placeCode === selected && row.outlet === outlet && (commodityId == null || row.commodityId === commodityId))
  const median = selected != null && commodityId != null ? cityMedian(rows, selected, commodityId, outlet) : null
  const place = selected == null ? null : placeByCode(selected)

  return (
    <div className="flex flex-col gap-3">
      <div className={cardClass("none", "overflow-hidden")}>
        <MapContainer center={[-2.6, 118]} zoom={5} scrollWheelZoom={false} className="z-0 h-[420px] w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <GeoJSON
            data={provinceFeatures() as never}
            style={() => ({
              color: ink,
              weight: provinceOutline.weight,
              fillOpacity: provinceOutline.fillOpacity,
              fillColor: ink,
            })}
          />
          {markers.map((marker) => {
            const at = placeByCode(marker.placeCode)
            if (at == null) return null
            const size = 14 + Math.min(marker.count, 8) * 2
            return (
              <Marker
                key={marker.placeCode}
                position={[at.latitude, at.longitude]}
                icon={divIcon({
                  className: "laporan-pin-wrap",
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2],
                  html: `<span class="laporan-pin" style="width:${size}px;height:${size}px"></span>`,
                })}
                eventHandlers={{ click: () => setSelected(marker.placeCode) }}
              />
            )
          })}
        </MapContainer>
      </div>
      {selected != null && place != null ? (
        <Card padding="md" className="flex flex-col gap-2">
          <h3 className="font-bold">{place.name}</h3>
          <button type="button" className="text-left text-sm text-slate" onClick={() => onProvince(place.provinceCode)}>
            Lihat provinsi
          </button>
          {selectedRows.length > 0 ? <p className="text-sm text-slate">{DITINJAU_COPY}</p> : null}
          {commodityId != null && selectedRows.length === 0 ? <p>{PIN_COMMODITY_EMPTY}</p> : null}
          {median != null && commodityId != null ? (
            <p>
              <span className="tabular-nums font-bold">
                {formatPrice(median.median, COMMODITIES.find((item) => item.id === commodityId)?.unit ?? "kg")}
              </span>{" "}
              dari {median.count} laporan. {CITY_MEDIAN_CAPTION}
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            {selectedRows.map((row) => (
              <ReportRow key={row.id} row={row} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function useTokenColor(): string {
  const [color, setColor] = useState("currentColor")
  useEffect(() => {
    const probe = document.createElement("span")
    probe.className = "text-ink"
    document.body.append(probe)
    setColor(getComputedStyle(probe).color)
    probe.remove()
  }, [])
  return color
}
