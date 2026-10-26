import { DateTime, Option } from "effect"

const jakarta = DateTime.zoneUnsafeMakeNamed("Asia/Jakarta")

/** Health timestamps are validated instants, displayed in the survey's timezone. */
export function formatHealthTime(iso: string | null): string {
  if (iso == null) return "belum tersedia"
  const parsed = DateTime.make(iso)
  if (Option.isNone(parsed)) return "belum tersedia"
  const date = DateTime.setZone(parsed.value, jakarta)
  return `${DateTime.format(date, { locale: "id-ID", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} WIB`
}
