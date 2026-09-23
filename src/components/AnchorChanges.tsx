import { formatDateShort, formatPct } from "#/lib/format.ts"
import type { AnchorChange } from "#/data/provider.ts"

type AnchorChangesProps = {
  harian: AnchorChange | null
  tahunan: AnchorChange | null
}

function readChange(change: AnchorChange | null): string {
  if (change == null) return "—"
  const count =
    change.overlap < change.surveyed
      ? ` · ${change.overlap} dari ${change.surveyed} provinsi`
      : ""
  return `${formatPct(change.pct)} vs ${formatDateShort(change.anchorDate)}${count}`
}

/** Perubahan harian and perubahan tahunan, separate from a chart window percent. */
export function AnchorChanges({ harian, tahunan }: AnchorChangesProps) {
  return (
    <dl className="mt-3 grid gap-2 text-sm">
      <div>
        <dt className="text-xs font-semibold text-slate">Perubahan harian</dt>
        <dd className="tabular-nums font-semibold">{readChange(harian)}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold text-slate">Perubahan tahunan</dt>
        <dd className="tabular-nums font-semibold">{readChange(tahunan)}</dd>
      </div>
    </dl>
  )
}
