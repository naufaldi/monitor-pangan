# Layout and data

## PageShell, PageHeader, SectionHeader, and StickyToolbar

Use `PageShell` for the route's main column. Narrow forms can set `className="max-w-md"`. Use `PageHeader` once for the route title and `SectionHeader` for a section within the route. Use `StickyToolbar` for filters that stay visible during scroll. For local table controls, use a `Panel` toolbar instead. The components have no variants. `PageHeader` is visible by default. Use `visuallyHidden` for the heading on toolbar-first routes and keep visible actions outside that hidden header.

```tsx
// Correct, excerpt from routes/index.tsx
<PageHeader title="Peta harga pangan" visuallyHidden />

// Incorrect: bypasses the route heading and creates a local type scale
<h2 className="text-3xl font-black">Peta harga pangan</h2>
```

See [layout.tsx](../../packages/ui/src/layout.tsx) for the shared layout and helpers, [lapor.tsx](../../src/routes/lapor.tsx) for a visible route title, and [ProvincePanel.tsx](../../src/components/ProvincePanel.tsx) for a section title.

## Card and Panel

Use `Card` for a standalone surface such as a form result or report item. Apply `cardClass` to an existing semantic element, as in the [chart summary](../../src/components/ChartSummaryStrip.tsx). Use `Panel` for a table or list with a heading, local controls in `toolbar`, or a legend in `headerExtra`. `Panel` handles the header layout on narrow screens. Use `StatusMessage` for loading feedback.

`Card` and `cardClass` accept only `none` (default, children own their spacing), `md` (`p-4`, standard content), and `lg` (`p-5`, roomier form or feedback content). `Panel` owns its padding and has no padding variant.

```tsx
// Correct, excerpt from LaporForm.tsx
<Card padding="lg" className="flex flex-col gap-2">
  <p className="font-bold">{SAVED_COPY}</p>
</Card>

// Incorrect: invents a padding size
<Card padding="xl"><p>{SAVED_COPY}</p></Card>
```

```text
Who owns the spacing?
├─ Children or a full-bleed body → none
├─ Standard report item or summary → md
└─ Roomier form or result → lg
```

See [LaporanList.tsx](../../src/components/LaporanList.tsx) for `md` and [PriceTable.tsx](../../src/components/PriceTable.tsx) for a `Panel` with search and sort controls.

## StatusMessage

Use for loading, an empty result, or an error. Use the field's own `error` for validation tied to one input, and `ListboxEmpty` for an empty picker menu. The only tones are `loading`, `empty`, and `error`. Choose one explicitly. `error` uses an alert and ember text. `loading` uses a busy status. `empty` uses a status. Pass a retry `Button` through `action` when retry is available. `bare` defaults to `false`. Use it inside an existing panel to avoid a second border.

The correct example is from [PriceTable.tsx](../../src/components/PriceTable.tsx). See [index.tsx](../../src/routes/index.tsx) for loading and retry states.

```tsx
// Correct
<StatusMessage tone="empty" title="Tidak ada provinsi yang cocok dengan pencarian." bare />

// Incorrect: a failed fetch is an error and there is no warning tone
<StatusMessage tone="warning" title="Harga gagal dimuat" />
```

```text
Result
├─ Request in progress → loading
├─ Request failed or coverage could not be confirmed → error
└─ Result is known and contains no matching rows → empty
```

## StatList and Stat

Use these together for summaries with a label, value, and optional hint. Use a table for row-by-row comparisons. `StatList` supports only `columns={3}` and `columns={4}` (default). Both start with two columns. Three expands at `sm`, four at `lg`. `Stat` has no accent by default. The only accents are `ember` and `leaf-deep`, used for meaningful highlights. Use `Delta` in a stat value when the number is a price change.

```tsx
// Correct, excerpt from DayaBeliSummary.tsx
<StatList columns={3} className="px-5 py-4">
  <Stat label="Acuan upah" value={`UMP ${wageYear}`} hint="pekerja formal" />
</StatList>

// Incorrect: invents a column count and an accent
<StatList columns={5}><Stat label="Acuan upah" value={wageYear} accent="gold" /></StatList>
```

See [ChartSummaryStrip.tsx](../../src/components/ChartSummaryStrip.tsx) for four columns.

## Delta

Use for signed price changes in a table or summary. For missing comparisons, render the existing missing-data treatment. `direction` is required and accepts only `up`, `down`, and `flat`. Pass formatted text with its sign or a clear label because the glyph is hidden from assistive technologies. See [delta.tsx](../../packages/ui/src/delta.tsx) for the mapping.

```tsx
// Correct, from PriceTable.tsx
<Delta direction={trendDirection(diff)}>{formatPct(diff)}</Delta>

// Incorrect: assigns a rising food price the falling-price color
<span className="text-leaf-deep">{formatPct(diff)}</span>
```

```text
Price direction
├─ up → ember, ▲
├─ down → leaf-deep, ▼
└─ flat → slate, •
```

## Table and cell helpers

Use `tableClass`, `thClass`, and `tdClass` on semantic table elements. Use a list for independently read items. The only alignments are `start` (default, text) and `end` (numbers, with tabular digits and no wrapping in body cells). Use `selectedRowClass` for an interactive table's selected row and preserve its keyboard interaction and selection state. See [table.ts](../../packages/ui/src/table.ts) for the helper contract and [PriceTable.tsx](../../src/components/PriceTable.tsx) for an interactive table.

```tsx
// Correct, from PriceTable.tsx
<th className={thClass("end")}>Harga</th>

// Incorrect: invents an alignment
<th className={thClass("center")}>Harga</th>
```
