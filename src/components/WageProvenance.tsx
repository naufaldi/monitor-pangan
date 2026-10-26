import { UMP_LAST_VERIFIED, UMP_SOURCE_NOTE } from "#/data/wages.ts"
import { formatDateLong } from "#/lib/format.ts"

/** A bundle cross-check is not completed decree-by-decree verification. */
export function WageProvenance() {
  return <div className="flex flex-col gap-2 text-sm text-slate">
    <p>{UMP_SOURCE_NOTE}</p>
    <p>Pemeriksaan silang bundel terakhir: {formatDateLong(UMP_LAST_VERIFIED)}. Tanggal ini bukan bukti verifikasi setiap Kepgub.</p>
  </div>
}
