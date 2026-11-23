# Tokens

[tokens.css](../../packages/ui/src/tokens.css) defines semantic Tailwind utilities and CSS variables. [tokens.ts](../../packages/ui/src/tokens.ts) mirrors the named palette as `color` for APIs that need resolved values, such as Leaflet styles and chart mark helpers. [tokens.test.ts](../../packages/ui/src/tokens.test.ts) checks the mirror. Use utilities in markup, CSS variables in CSS, and the mirror where a renderer needs a resolved color.

## Surfaces, text, and borders

```text
Surface
├─ Route background or sticky filter bar → bg-canvas
├─ Card, field, or menu → bg-paper via the shared component
├─ Muted header, hover, or neutral badge → bg-muted
└─ Selected row → selectedRowClass (bg-selected with an ink edge)

Text
├─ Main text or value → text-ink
├─ Label, hint, or secondary text → text-slate
├─ Text on a primary button → text-paper via Button
└─ Price direction → Delta
```

Use `border-hairline` for app separators and shared control borders. Use the exported `focusRing` for custom interactive markup. It defines a 2px visible outline and 2px offset using `--ring`. Use the component's own focus treatment when it already provides one.

| CSS role | Backing in `tokens.css` |
| --- | --- |
| `canvas`, `paper` | `#f4f5f0`, `#ffffff` |
| `ink`, `slate` | `#1a1c16`, `#5c6358` |
| `hairline`, `selected` | `#e4e6df`, `#e9ebe3` |
| `background`, `card` | Root aliases, both `oklch(1 0 0)` |
| `foreground`, `card-foreground` | Root aliases, both `oklch(0.153 0.006 107.1)` |
| `muted`, `muted-foreground` | Root aliases, `oklch(0.967 0.001 286.375)` and `oklch(0.58 0.031 107.3)` |
| `border`, `input`, `ring` | Root aliases, `#e4e6df`, `#e4e6df`, and `#1a1c16` |

## Data and feedback colors

| Role | Backing | Use |
| --- | --- | --- |
| `ember` / `ember-soft` | `#dc2626` / `#fef2f2` | Rising prices, error text, a tinted ember badge, or the high end of the price map |
| `leaf-deep`, `leaf`, `leaf-soft` | `#00714c`, `#00bd7d`, `#e7f6ef` | Falling prices, favorable data bands, and the existing deep-green primary action |
| `gold` / `gold-soft` | `#eab308` / `#fdf8e6` | Middle data bands and their tints |
| `heat` / `heat-soft` | `#f97316` / `#fff1e6` | Elevated price or weaker purchasing-power bands and their tints |

Use [province-fill.ts](../../src/lib/province-fill.ts) for price-map bands, [chart-marks.ts](../../src/lib/chart-marks.ts) for chart mark paint, and [daya-beli-tier.ts](../../src/components/daya-beli-tier.ts) for purchasing-power tiers. These mappings carry different domain meanings. Keep data colors out of generic selection states. Use text such as `Tidak ada data` for missing observations and keep the existing map or chart gap treatment.

## Type, shape, and layers

- `font-sans` uses `ui-sans-serif, system-ui, sans-serif`. `PageHeader` owns route title styling (`text-lg font-bold`). `SectionHeader` owns section title styling (`text-base font-bold`). `eyebrowClass` owns small labels (`text-xs font-semibold text-slate`). Use tabular numbers for changing values and numeric columns.
- `rounded-sm`, `rounded-md`, `rounded-lg`, and `rounded-xl` use 0.6×, 0.8×, 1×, and 1.4× the base radius of `0.625rem`. Use the radius already set by the primitive. Pills and badges use `rounded-full`.
- Field menus use `--z-menu` (50). Sticky filters use `--z-toolbar` (40). Use `fieldMenuClass` and `StickyToolbar` to preserve that ordering.

The correct example is from [styles.css](../../src/styles.css).

```css
/* Correct */
@apply bg-canvas text-ink font-sans antialiased;

/* Incorrect: duplicates the canvas color at the call site */
background: #f4f5f0;
```
