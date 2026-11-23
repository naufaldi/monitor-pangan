# Actions and badges

## Button

Use `Button` for actions. For navigation use a router `Link` with `navPillClass(active)` for the main nav, or `buttonClass` on a link that needs to look like an action. A real link preserves normal browser navigation.

The only variants are `pill` (default, general utility or retry), `rect` (compact controls such as date controls and segmented options), and `primary` (the main action in a form or action group). All have a minimum height of 44px. `active` defaults to `false` and changes the appearance of `pill` and `rect` only. Use `aria-pressed` for toggle buttons. The default HTML type is `button`. Set `type="submit"` for a form submission.

The correct example is from [admin.tsx](../../src/routes/admin.tsx). The default utility action appears in [CsvButton.tsx](../../src/components/CsvButton.tsx) and the compact action in [LaporForm.tsx](../../src/components/LaporForm.tsx).

```tsx
// Correct
<Button type="submit" variant="primary">Masuk</Button>

// Incorrect: the shared union has no solid variant
<Button type="submit" variant="solid">Masuk</Button>
```

```text
Action
├─ Main submit or save → primary
├─ Compact grouped or date control → rect
└─ General action such as retry or export → pill
```

## SegmentedControl

Use for a short set of visible options with exactly one selected value, such as sort order or a trend range. Use `FieldSelect` for native option lists and `CommoditySelect` for grouped commodity search. [SegmentedControl](../../packages/ui/src/segmented.tsx) always uses `rect` buttons with `aria-pressed`. Supply the active `value`, its typed `options`, an accessible `label`, and `onChange`. The component has no variant prop or default selection.

```tsx
// Correct, excerpt from PriceTable.tsx
<SegmentedControl
  label="Urutkan"
  options={[
    { value: "price-desc", label: "Termahal" },
    { value: "price-asc", label: "Termurah" },
    { value: "name", label: "Nama A–Z" },
  ] as const}
  value={sort}
  onChange={setSort}
/>

// Incorrect: builds separate buttons for a single selection
<Button variant="pill" onClick={() => setSort("price-desc")}>Termahal</Button>
```

See [PriceTable.tsx](../../src/components/PriceTable.tsx) and [tren.tsx](../../src/routes/tren.tsx) for the option arrays.

## Badge

Use for short, passive labels like data provenance or report review state. Use `StatusMessage` for feedback with context or a recovery action, and `Delta` for price changes.

The only tones are `ember` (API default, used for `Data contoh`) and `neutral` (routine labels such as `Ditinjau`). Set the tone explicitly when it carries meaning. Keep purchasing-power tier color in the existing domain mapping, which is specific to that scale.

The correct example is from [LaporanList.tsx](../../src/components/LaporanList.tsx). See [__root.tsx](../../src/routes/__root.tsx) for source labels and [primitives.tsx](../../packages/ui/src/primitives.tsx) for the tone union.

```tsx
// Correct
<Badge tone="neutral" aria-describedby="ditinjau-arti">Ditinjau</Badge>

// Incorrect: review state has no success tone
<Badge tone="success">Ditinjau</Badge>
```
