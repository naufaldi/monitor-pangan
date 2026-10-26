type SeriesStore = Record<string, (number | null)[]>

type TrendBundle = {
  weeks: string[]
  weekly: SeriesStore
  months: string[]
  monthly: SeriesStore
}

const seriesSource = (store: SeriesStore): string =>
  Object.entries(store).map(([key, values]) => `  ${JSON.stringify(key)}: ${JSON.stringify(values)},`).join("\n")

/** Keep each commodity independently cacheable without changing the provider's exports. */
export function renderTrendModules(bundle: TrendBundle): Record<string, string> {
  const commodities = [...new Set([...Object.keys(bundle.weekly), ...Object.keys(bundle.monthly)]
    .map((key) => key.split("|")[0]!))].sort()
  const modules: Record<string, string> = {}
  const imports: string[] = []
  for (const [index, commodity] of commodities.entries()) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(commodity)) throw new Error(`Invalid commodity ID: ${commodity}`)
    const select = (store: SeriesStore): SeriesStore => Object.fromEntries(
      Object.entries(store).filter(([key]) => key.startsWith(`${commodity}|`)),
    )
    modules[`trends/${commodity}.gen.ts`] =
      `export const weekly: Record<string, (number|null)[]> = {\n${seriesSource(select(bundle.weekly))}\n};\n` +
      `export const monthly: Record<string, (number|null)[]> = {\n${seriesSource(select(bundle.monthly))}\n};\n`
    imports.push(`import { weekly as weekly${index}, monthly as monthly${index} } from "./trends/${commodity}.gen.ts";`)
  }
  const merge = (prefix: string): string => commodities.map((_, index) => `...${prefix}${index}`).join(", ")
  modules["trends.gen.ts"] = `${imports.join("\n")}\n` +
    `export const TREND_WEEKS: string[] = ${JSON.stringify(bundle.weeks)};\n` +
    `export const TREND_WEEKLY: Record<string, (number|null)[]> = { ${merge("weekly")} };\n` +
    `export const TREND_MONTHS: string[] = ${JSON.stringify(bundle.months)};\n` +
    `export const TREND_MONTHLY: Record<string, (number|null)[]> = { ${merge("monthly")} };\n`
  return modules
}
