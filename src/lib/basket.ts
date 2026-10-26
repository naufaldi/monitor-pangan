import { Schema } from "effect"
import { COMMODITIES } from "#/data/catalog.ts"
import { provinceOverviewRows, type ProvinceOverview } from "./province-overview.ts"

const QuantityText = Schema.String.pipe(Schema.pattern(/^\d+(?:[.,]\d{1,2})?$/), Schema.maxLength(16))
export type Quantity = { valid: true; hundredths: number } | { valid: false }

/** Integer hundredths preserve both decimal input and the commodity's own unit. */
export function parseQuantity(input: string): Quantity {
  const text = input.trim()
  if (text === "") return { valid: true, hundredths: 0 }
  if (!Schema.is(QuantityText)(text)) return { valid: false }
  const [whole, fraction = ""] = text.replace(",", ".").split(".")
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(hundredths) && hundredths <= 100000 ? { valid: true, hundredths } : { valid: false }
}

export type BasketTotal = { status: "complete"; total: number } | { status: "empty" | "invalid" | "incomplete" }

export function calculateBasket(overview: ProvinceOverview, province: string, quantities: Record<string, string>, official: boolean, previousOfficial = official) {
  const rows = provinceOverviewRows(overview, province)
  const lines = rows.map((row) => {
    const quantity = parseQuantity(quantities[row.commodity.id] ?? "")
    const cost = (price: number | null) => {
      if (!quantity.valid || quantity.hundredths === 0 || price == null) return null
      const rounded = Math.round(price * quantity.hundredths / 100)
      return Number.isSafeInteger(rounded) && rounded >= 0 ? rounded : null
    }
    const price = official ? row.price : null
    const previousPrice = previousOfficial ? row.previousPrice : null
    return { ...row, price, previousPrice, quantity, cost: cost(price), previousCost: cost(previousPrice) }
  })
  const invalid = Object.keys(quantities).some((id) => !COMMODITIES.some((item) => item.id === id)) || lines.some((line) => !line.quantity.valid)
  const selected = lines.filter((line) => line.quantity.valid && line.quantity.hundredths > 0)
  const total = (key: "cost" | "previousCost"): BasketTotal => {
    if (invalid) return { status: "invalid" }
    if (selected.length === 0) return { status: "empty" }
    if (selected.some((line) => line[key] == null)) return { status: "incomplete" }
    const sum = selected.reduce((value, line) => value + line[key]!, 0)
    return Number.isSafeInteger(sum) ? { status: "complete", total: sum } : { status: "incomplete" }
  }
  const current = total("cost")
  const previous = total("previousCost")
  const changeRp = current.status === "complete" && previous.status === "complete" && previous.total > 0 ? current.total - previous.total : null
  const changePct = changeRp != null && previous.status === "complete" ? changeRp / previous.total * 100 : null
  return { lines, selectedCount: selected.length, current, previous, changeRp, changePct }
}

export type BasketEstimate = ReturnType<typeof calculateBasket>
