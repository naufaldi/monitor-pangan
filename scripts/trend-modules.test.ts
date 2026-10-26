import ts from "typescript"
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { renderTrendModules } from "./trend-modules.ts"

it.effect("commodity modules preserve every price, gap and period from both resolutions", () => Effect.sync(() => {
  const bundle = {
    weeks: ["2026-09-07", "2026-09-14"],
    weekly: { "beras|nasional": [15000, null], "beras|31": [null, 16000], "gula-pasir|nasional": [17000, 17100] },
    months: ["2026-09-01"],
    monthly: { "beras|nasional": [15000], "gula-pasir|nasional": [null], "cabai-merah|31": [35000] },
  }
  const modules = renderTrendModules(bundle)
  const weekly: Record<string, unknown> = {}
  const monthly: Record<string, unknown> = {}
  for (const [path, source] of Object.entries(modules)) {
    if (path === "trends.gen.ts") continue
    const output = ts.transpile(source, { module: ts.ModuleKind.CommonJS })
    const exports: { weekly?: object; monthly?: object } = {}
    new Function("exports", output)(exports)
    Object.assign(weekly, exports.weekly)
    Object.assign(monthly, exports.monthly)
  }
  assert.deepStrictEqual(weekly, bundle.weekly)
  assert.deepStrictEqual(monthly, bundle.monthly)
  assert.include(modules["trends.gen.ts"]!, JSON.stringify(bundle.weeks))
  assert.include(modules["trends.gen.ts"]!, JSON.stringify(bundle.months))
  assert.lengthOf(Object.keys(modules), 4)
}))

it.effect("updating one commodity leaves every other generated module unchanged", () => Effect.sync(() => {
  const bundle = {
    weeks: ["2026-09-14"],
    weekly: { "beras|nasional": [15000], "gula-pasir|nasional": [17000] },
    months: ["2026-09-01"],
    monthly: { "beras|nasional": [15000], "gula-pasir|nasional": [17000] },
  }
  const before = renderTrendModules(bundle)
  const after = renderTrendModules({ ...bundle, weekly: { ...bundle.weekly, "beras|nasional": [15100] } })
  assert.notStrictEqual(after["trends/beras.gen.ts"], before["trends/beras.gen.ts"])
  assert.strictEqual(after["trends/gula-pasir.gen.ts"], before["trends/gula-pasir.gen.ts"])
  assert.strictEqual(after["trends.gen.ts"], before["trends.gen.ts"])
}))
