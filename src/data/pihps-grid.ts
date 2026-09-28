import { Data, Effect, Schema } from "effect"
import { GRUP_BY_PIHPS_NAME } from "./pihps-catalog.ts"

const PihpsCell = Schema.Union(Schema.String, Schema.Number, Schema.Null)

const PihpsRow = Schema.Struct(
  {
    name: Schema.String,
    level: Schema.Number,
  },
  Schema.Record({ key: Schema.String, value: PihpsCell }),
)

const PihpsGridSchema = Schema.Struct({
  data: Schema.optional(Schema.Array(PihpsRow)),
})

export class PihpsDecodeError extends Data.TaggedError("PihpsDecodeError")<{
  readonly message: string
}> {}

export type PihpsPriceCell = {
  readonly date: string
  readonly commodityId: string
  readonly regionCode: string
  readonly price: number
}

/** PIHPS prints thousands with a comma: "16,950" → 16950. "-" and blanks are missing. */
export function parsePihpsNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw)
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (trimmed === "" || trimmed === "-") return null
  const stripped = trimmed.replaceAll(".", "")
  const normalized = /,(\d{3})$/.test(stripped) ? stripped.replace(",", "") : stripped.replace(",", ".")
  const value = Number(normalized)
  return Number.isFinite(value) ? Math.round(value) : null
}

function columnKey(date: string): string {
  const [year, month, day] = date.split("-")
  return `${day}/${month}/${year}`
}

/** Provincial level-1 prices for one PIHPS grid response. */
export const parsePihpsGrid = Effect.fn("Pihps.parseGrid")(function* (
  date: string,
  regionCode: string,
  input: unknown,
) {
  const grid = yield* Schema.decodeUnknown(PihpsGridSchema)(input).pipe(
    Effect.mapError((error) => new PihpsDecodeError({ message: String(error) })),
  )
  const column = columnKey(date)
  const cells: PihpsPriceCell[] = []
  for (const row of grid.data ?? []) {
    if (row.level !== 1) continue
    const commodityId = GRUP_BY_PIHPS_NAME[row.name]
    if (commodityId == null) continue
    const price = parsePihpsNumber(row[column])
    if (price == null) continue
    cells.push({ date, commodityId, regionCode, price })
  }
  return cells
})
