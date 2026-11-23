# Monitor Pangan design system

Monitor Pangan uses a light canvas, white surfaces, and dark text. Controls use neutral colors for selection. Price changes and data scales use color to carry meaning alongside labels, values, or glyphs.

## Start here for UI changes

1. Check the [public exports](packages/ui/src/index.ts) and choose the existing component, helper, and documented variant. Import shared UI from `@monitor-pangan/ui`.
2. Use `className` for layout such as spacing, width, and grid. Keep colors, borders, radii, and typography in the shared implementation. Use semantic tokens for app chrome and keep raw colors in the token source.
3. Treat each variant list as closed. If a use case genuinely needs a new appearance, define it in the shared component, cover any changed class helper with its colocated test, and update the guide in the same change. A call site cannot create a variant with a string or a styling override.
4. Keep domain behavior in `src/components` and reusable UI in `packages/ui`. When an unshared pattern appears a second time, export the shared implementation and migrate both call sites.

## Choose a pattern

| Task | Guide |
| --- | --- |
| Pick a surface, text color, focus style, or data color | [Tokens](docs/design/tokens.md) |
| Add an action, navigation link, badge, or segmented choice | [Actions and badges](docs/design/actions.md) |
| Add a field, search box, file picker, or combobox | [Fields and pickers](docs/design/fields.md) |
| Lay out a route, table, status, or price summary | [Layout and data](docs/design/layout-and-data.md) |

The exported types and defaults define what the code accepts. If this guide drifts, update it from the shared source and its call sites.
