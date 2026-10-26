import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { chartHighlights } from "#/lib/chart-summary.ts"
import { ChartHighlights } from "./ChartHighlights.tsx"
import { PriceTable, type TableRow } from "./PriceTable.tsx"

function renderPrices(rows: TableRow[], average: number | null): string {
  return renderToStaticMarkup(createElement(PriceTable, {
    commodityName: "Beras",
    date: "2026-10-26",
    rows,
    unit: "kg",
    average,
    selectedCode: null,
    onSelect: () => {},
  }))
}

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

it.effect("announces every empty chart highlight as a status with its own explanation", () =>
  Effect.sync(() => {
    const html = renderToStaticMarkup(createElement(ChartHighlights, {
      highlights: chartHighlights([]),
      unit: "kg",
      resolution: "day",
    }))
    const cards = html.match(/<article\b[\s\S]*?<\/article>/g) ?? []
    const explanations = [
      "Tidak ada kenaikan di rentang ini.",
      "Tidak ada penurunan di rentang ini.",
      "Belum ada pergerakan.",
    ]
    assert.strictEqual(cards.length, 3)
    cards.forEach((card, index) => {
      assert.include(card, 'role="status"')
      assert.include(visibleText(card), explanations[index]!)
    })
    assert.notInclude(visibleText(html), "%")
  }),
)

it.effect("keeps observed highlights when only the downward highlight is empty", () =>
  Effect.sync(() => {
    const html = renderToStaticMarkup(createElement(ChartHighlights, {
      highlights: chartHighlights([
        { date: "2026-10-23", price: 10000 },
        { date: "2026-10-26", price: 11000 },
      ]),
      unit: "kg",
      resolution: "day",
    }))
    assert.strictEqual(html.match(/role="status"/g)?.length, 1)
    assert.include(visibleText(html), "Tidak ada penurunan di rentang ini.")
    assert.include(visibleText(html), "▲ +10,0%")
    assert.notInclude(visibleText(html), "Belum ada pergerakan.")
  }),
)

it.effect("shows missing province prices without fabricating a zero price or percentage", () =>
  Effect.sync(() => {
    const html = renderPrices([{ regionCode: "11", name: "Aceh", price: null }], 10000)
    const text = visibleText(html)
    assert.include(text, "Aceh Tidak ada data —")
    assert.notInclude(text, "Rp")
    assert.notInclude(text, "%")
  }),
)

it.effect("keeps the known province price but omits comparisons without a usable national average", () =>
  Effect.sync(() => {
    for (const average of [null, 0, -100]) {
      const html = renderPrices([{ regionCode: "11", name: "Aceh", price: 20000 }], average)
      const text = visibleText(html)
      assert.include(text, "Aceh Rp 20.000/kg —")
      assert.notInclude(text, "Tidak ada data")
      assert.notInclude(text, "%")
    }
  }),
)

it.effect("uses Indonesian percentages and the same decorative direction glyphs in tables and highlights", () =>
  Effect.sync(() => {
    const table = renderPrices([
      { regionCode: "11", name: "Aceh", price: 11000 },
      { regionCode: "12", name: "Sumatera Utara", price: 9000 },
      { regionCode: "13", name: "Sumatera Barat", price: 10000 },
    ], 10000)
    const highlights = renderToStaticMarkup(createElement(ChartHighlights, {
      highlights: chartHighlights([
        { date: "2026-10-21", price: 10000 },
        { date: "2026-10-22", price: 11000 },
        { date: "2026-10-23", price: 9900 },
        { date: "2026-10-26", price: 9900 },
      ]),
      unit: "kg",
      resolution: "day",
    }))
    for (const html of [table, highlights]) {
      const text = visibleText(html)
      assert.include(text, "▲ +10,0%")
      assert.include(text, "▼ -10,0%")
      assert.include(text, "• 0,0%")
      for (const glyph of ["▲", "▼", "•"]) {
        assert.include(html, `<span aria-hidden="true">${glyph} </span>`)
      }
      assert.notInclude(text, "10.0%")
    }
  }),
)
