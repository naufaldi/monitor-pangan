import { Link } from "@tanstack/react-router"
import { Badge, Button, Card, buttonClass } from "@monitor-pangan/ui"
import { COMMODITIES } from "#/data/catalog.ts"
import {
  DITINJAU_COPY,
  EMPTY_WINDOW_COPY,
  PHOTO_REMOVED_COPY,
  evidenceLabel,
  outletLabel,
  type PublicReport,
} from "#/data/laporan.ts"
import { loadProvinces } from "#/data/geo.ts"
import { placeByCode } from "#/data/places.ts"
import { formatDateShort, formatPrice } from "#/lib/format.ts"
import { photoPresentation } from "#/lib/laporan.ts"

type LaporanListProps = {
  rows: readonly PublicReport[]
  windowEmpty: boolean
  canLoadOlder: boolean
  onLoadOlder: () => void
}

const provinces = new Map(loadProvinces().map((province) => [province.code, province.name]))

/** Text list of reviewed citizen reports. This is the alternative to the map. */
export function LaporanList({ rows, windowEmpty, canLoadOlder, onLoadOlder }: LaporanListProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Laporan yang ditinjau</h2>
          <p id="ditinjau-arti" className="text-sm text-slate">
            {DITINJAU_COPY}
          </p>
        </div>
        <Link to="/lapor" className={buttonClass("pill")}>
          Lapor harga
        </Link>
      </div>
      {windowEmpty ? (
        <Card padding="md">
          <p>{EMPTY_WINDOW_COPY}</p>
        </Card>
      ) : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <ReportRow row={row} />
          </li>
        ))}
      </ul>
      {canLoadOlder ? (
        <Button type="button" onClick={onLoadOlder}>
          Muat laporan lebih lama
        </Button>
      ) : null}
    </section>
  )
}

export function ReportRow({ row }: { row: PublicReport }) {
  const commodity = COMMODITIES.find((item) => item.id === row.commodityId)
  const place = placeByCode(row.placeCode)
  const province = provinces.get(row.placeCode.slice(0, 2)) ?? row.placeCode.slice(0, 2)
  const unit = commodity?.unit ?? "kg"
  const presentation = photoPresentation(row)
  return (
    <Card padding="md" className="flex gap-3">
      <PhotoSlot presentation={presentation} id={row.id} />
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {commodity?.name ?? row.commodityId}{" "}
          <span className="tabular-nums">{formatPrice(row.price, unit)}</span>
        </p>
        <p className="text-sm">
          {outletLabel(row.outlet)} · {place?.name ?? row.placeCode} · {province}
        </p>
        <p className="text-sm text-slate">
          {formatDateShort(row.seenOn)} · {row.alias ?? "Anonim"} · {evidenceLabel(row.evidence)}
        </p>
        <Badge tone="neutral" aria-describedby="ditinjau-arti">
          Ditinjau
        </Badge>
      </div>
    </Card>
  )
}

function PhotoSlot({ presentation, id }: { presentation: ReturnType<typeof photoPresentation>; id: string }) {
  switch (presentation) {
    case "image":
      return <img src={`/foto/${id}`} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
    case "removed":
      return <p className="w-28 shrink-0 text-xs text-slate">{PHOTO_REMOVED_COPY}</p>
    case "label":
      return null
    default: {
      const _exhaustive: never = presentation
      return _exhaustive
    }
  }
}
