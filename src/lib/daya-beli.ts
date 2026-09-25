import type { PriceUnit } from "#/data/catalog.ts"

export type AffordabilityRow = {
  regionCode: string
  name: string
  wageRpPerBulan: number | null
  price: number | null
  /** Whole units one monthly wage buys. Null when wage or price is missing. */
  amount: number | null
  unit: PriceUnit
  /** 1-based rank among priced provinces only. Null rows are never ranked. */
  rank: number | null
}

export type AffordabilitySort = "amount-desc" | "amount-asc" | "name"

/** Null-safe floor division of a monthly wage by a unit price. */
export function kgPerWage(
  wageRpPerBulan: number | null,
  price: number | null,
): number | null {
  if (wageRpPerBulan == null || price == null) return null
  if (!Number.isFinite(wageRpPerBulan) || !Number.isFinite(price)) return null
  if (wageRpPerBulan <= 0 || price <= 0) return null
  return Math.floor(wageRpPerBulan / price)
}

/** Join provinces with wages and prices; priced rows ranked, gaps unranked. */
export function buildAffordabilityRows(args: {
  provinces: { code: string; name: string }[]
  wages: Map<string, number>
  prices: Map<string, number | null>
  unit: PriceUnit
}): AffordabilityRow[] {
  const rows = args.provinces.map((p) => {
    const wage = args.wages.get(p.code) ?? null
    const price = args.prices.get(p.code) ?? null
    return {
      regionCode: p.code,
      name: p.name,
      wageRpPerBulan: wage,
      price,
      amount: kgPerWage(wage, price),
      unit: args.unit,
      rank: null as number | null,
    }
  })
  const priced = rows
    .filter((r) => r.amount != null)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  priced.forEach((r, i) => {
    r.rank = i + 1
  })
  const gaps = rows.filter((r) => r.amount == null)
  return [...priced, ...gaps]
}

/** Order rows for display; gap rows always trail in input order, never sorted. */
export function sortAffordability(
  rows: AffordabilityRow[],
  sort: AffordabilitySort,
): AffordabilityRow[] {
  const priced = rows.filter((r) => r.amount != null)
  const gaps = rows.filter((r) => r.amount == null)
  switch (sort) {
    case "amount-desc":
      priced.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
      break
    case "amount-asc":
      priced.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))
      break
    case "name":
      priced.sort((a, b) => a.name.localeCompare(b.name, "id"))
      break
    default: {
      const _exhaustive: never = sort
      return _exhaustive
    }
  }
  return [...priced, ...gaps]
}
