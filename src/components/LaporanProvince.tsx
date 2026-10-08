import { Card, Select } from "@monitor-pangan/ui"
import { COMMODITIES } from "#/data/catalog.ts"
import {
  MEDIAN_CAPTION,
  floorCopy,
  medianRangeCopy,
  medianStatsCopy,
  outletLabel,
  type Outlet,
  type PublicReport,
} from "#/data/laporan.ts"
import { loadProvinces } from "#/data/geo.ts"
import { placeByCode } from "#/data/places.ts"
import { formatRupiah } from "#/lib/format.ts"
import { provinceRollup } from "#/lib/laporan.ts"

type LaporanProvinceProps = {
  rows: readonly PublicReport[]
  commodityId: string | null
  provinceCode: string | null
  onProvince: (code: string) => void
}

const provinces = loadProvinces()

/** Per-outlet median of city medians. Pasar and ritel are never combined. */
export function LaporanProvince({ rows, commodityId, provinceCode, onProvince }: LaporanProvinceProps) {
  return (
    <Card padding="md" className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate">Provinsi</span>
        <Select value={provinceCode ?? ""} onChange={(event) => onProvince(event.target.value)}>
          <option value="">Pilih provinsi</option>
          {provinces.map((province) => (
            <option key={province.code} value={province.code}>
              {province.name}
            </option>
          ))}
        </Select>
      </label>
      {provinceCode == null ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <OutletRollup rows={rows} provinceCode={provinceCode} commodityId={commodityId} outlet="pasar" />
          <OutletRollup rows={rows} provinceCode={provinceCode} commodityId={commodityId} outlet="ritel" />
        </div>
      )}
    </Card>
  )
}

function OutletRollup({
  rows,
  provinceCode,
  commodityId,
  outlet,
}: {
  rows: readonly PublicReport[]
  provinceCode: string
  commodityId: string | null
  outlet: Outlet
}) {
  const rollup = provinceRollup(rows, provinceCode, commodityId, outlet, (code) => placeByCode(code)?.name ?? code)
  const unit = COMMODITIES.find((item) => item.id === commodityId)?.unit ?? "kg"
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-bold">{outletLabel(outlet)}</h3>
      {rollup.kind === "counts" ? <CityList cities={rollup.cities} /> : null}
      {rollup.kind === "floor" ? (
        <>
          <p>{floorCopy(rollup.cityCount, rollup.reportCount)}</p>
          <CityList cities={rollup.cities} />
        </>
      ) : null}
      {rollup.kind === "median" ? (
        <>
          <p className="tabular-nums text-lg font-bold">{formatRupiah(rollup.median)}/{unit}</p>
          <p className="text-sm">{medianStatsCopy(rollup.cityCount, rollup.reportCount)}</p>
          <p className="text-sm">
            {medianRangeCopy(
              rollup.low.name,
              formatRupiah(rollup.low.median),
              rollup.high.name,
              formatRupiah(rollup.high.median),
            )}
          </p>
          <p className="text-sm text-slate">{MEDIAN_CAPTION}</p>
          <CityList cities={rollup.cities} />
        </>
      ) : null}
    </section>
  )
}

function CityList({ cities }: { cities: readonly { placeCode: string; name: string; count: number }[] }) {
  if (cities.length === 0) return <p className="text-sm text-slate">Belum ada kota.</p>
  return (
    <ul className="text-sm">
      {cities.map((city) => (
        <li key={city.placeCode}>
          {city.name} · {city.count} laporan
        </li>
      ))}
    </ul>
  )
}
