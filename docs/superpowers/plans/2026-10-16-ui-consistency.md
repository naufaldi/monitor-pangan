# UI Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the UI consistency audit, issues #22–#30, tracked in #31. Every control, toggle, heading, state message and color comes from `packages/ui`, and the app reads the same on every route at both 1280px and 390px.

**Architecture:** The work lands as five PRs, ordered by file overlap.
1. Primitives, tokens and new shared components in `packages/ui`. No behavior change.
2. Adoption across `src/components` and `src/routes`.
3. Copy and number formatting.
4. Mobile layout.
5. A data-backed audit on `wrangler dev`.

Each PR is green on its own. Pure helpers get Effect-style unit tests. Visual changes are verified by re-measuring in the browser, because the repo has no DOM test library and this plan does not add one.

**Tech Stack:** React 19, TanStack Router/Start, Tailwind 4 (`@theme inline` tokens), `clsx` + `tailwind-merge`, Vitest via `@effect/vitest` (`it.effect`, `assert`), pnpm workspaces.

---

## Ground rules (read before any task)

- **Gates per task:** `pnpm typecheck`, `pnpm test <explicit files>`, and `pnpm build` at the end of every PR. Never run bare `pnpm test` in watch mode.
- **Test style:** Tests use `import { Effect } from "effect"` and `import { assert, it } from "@effect/vitest"`, and wrap bodies in `it.effect("…", () => Effect.sync(() => { … }))`. Never use Vitest `expect`. No `async`/`await` or `try`/`catch` in tests.
- **Imports:** App code imports shared UI only from `@monitor-pangan/ui`. Inside `packages/ui`, import siblings by relative path (`./primitives.tsx`).
- **Do not edit** `src/routeTree.gen.ts` or `src/data/*.gen.ts`.
- **Exhaustive switches:** `src/routes/tren.tsx` keeps its exhaustive `switch` with a `never` default. New switches follow the same pattern.
- **Browser check:** Run `pnpm dev --port 3001`; if 3001 is taken, use `pnpm dev --port 3002`. On `vite dev`, `/api/laporan*` returns 404, which is expected. Only Phase 5 needs the worker.
- **PR linking:** after every `gh pr create`, register the PR URL with the T3 Code `link_pull_request` tool.
- **Branches:** one per phase: `ui/phase-1-primitives`, `ui/phase-2-adoption`, `ui/phase-3-copy-format`, `ui/phase-4-mobile`, `ui/phase-5-data-audit`. Each PR body links the issues it closes and has before/after screenshots at 1280 and 390.

## Decisions locked by this plan

| Topic | Decision | Why |
|---|---|---|
| Field radius | `rounded-lg` (10px) for every input, select, trigger and button. Cards stay `rounded-xl`. | Inputs and buttons already use 10px. Only the triggers drift. |
| Field border | `border-hairline`. `--border` and `--input` become the same value. | One border color for chrome. |
| Focus ring | `outline-2 outline-offset-2 outline-ring` on `:focus-visible`. `--ring` becomes ink `#1a1c16`. | The old `--ring` (light gray) fails 3:1 contrast against canvas. |
| Primary button | New `primary` variant: `bg-leaf-deep text-paper`, `rounded-lg`. | Ink is already the "active toggle" fill, so primary needs a different hue. |
| Selection tint | New token `--color-selected: #e9ebe3` plus an inset ink bar. | Ember means "above average"; it can't also mean "selected". |
| Header badge | `ember` only for "Data contoh"; `neutral` for live PIHPS dates. | A warning color should mean a warning. |
| Sort affordance | Two options use `SegmentedControl` (Daya Beli). Three or more use `FieldSelect` (Peta). | This rule makes the existing difference deliberate. |
| Direction glyphs | `▲` up, `▼` down, `•` flat, everywhere. | MoversList already uses these, and they read better at text-sm. |
| Percent format | id-ID: `+44,7%`, `-4,4%`, `0,0%`. | Matches rupiah, which already uses id-ID. |
| Page titles | Visible `PageHeader` on `/lapor`, `/laporan` and `/admin`. On `/`, `/tren` and `/daya-beli` it is `sr-only`, because those pages lead with their toolbar. | Each page gets one h2 without moving the map or chart down. |
| z-index | `--z-toolbar: 40` and `--z-menu: 50`, used through `z-(--z-toolbar)`. | Daya Beli table headers use z-20 and z-30, so the toolbar must sit above both. |

### Need → component

Every app screen builds from these. `src/ui-guard.test.ts` (Task 2.0) fails CI when the app hand-rolls one of them.

| Need | Use (from `@monitor-pangan/ui`) |
|---|---|
| Pick one of 3+ values | `FieldSelect` |
| Pick one of 2 values | `SegmentedControl` |
| Searchable picker | `ListboxSearch`, `Listbox`, `ListboxGroup`, `ListboxOption`, `ListboxEmpty` |
| Filter a list or table | `SearchInput` |
| File upload | `FileInput` |
| Price or percent change | `Delta` (or `directionGlyph` / `directionTextClass` in SVG) |
| Card with a title bar and controls | `Panel` |
| Label and value figures | `StatList` + `Stat` |
| Data table | `tableClass`, `thClass`, `tdClass` |
| Selected row or option | `selectedRowClass` |
| Page wrapper and its toolbar | `PageShell`, `StickyToolbar` |
| Page and section titles | `PageHeader`, `SectionHeader`, `eyebrowClass` |
| Nav link | `navPillClass` |
| Empty, error, loading | `StatusMessage` |
| Color in SVG or Leaflet | `color` from `tokens.ts` |

## File map

**Create (packages/ui):**
- `packages/ui/src/tokens.ts`: TS mirror of the color tokens, for SVG and Leaflet
- `packages/ui/src/tokens.test.ts`: test that keeps `tokens.ts` in sync with `tokens.css`
- `packages/ui/src/primitives.test.ts`: class-string tests for `buttonClass`, `inputClass` and `selectClass`
- `packages/ui/src/field.tsx`: `ChevronBadge`, `fieldTriggerClass`, `fieldMenuClass`, `FieldSelect`, `FileInput`. Moved from `src/components`.
- `packages/ui/src/segmented.tsx`: `SegmentedControl`
- `packages/ui/src/layout.tsx`: `pageShellClass`, `stickyToolbarClass`, `PageHeader`, `SectionHeader`, `eyebrowClass`, `selectedRowClass`
- `packages/ui/src/status.tsx`: `StatusMessage`
- `packages/ui/src/delta.tsx` + `delta.test.ts`: `Delta`, `directionGlyph`, `directionTextClass`
- `packages/ui/src/panel.tsx`: `Panel`
- `packages/ui/src/stat.tsx`: `StatList`, `Stat`
- `packages/ui/src/listbox.tsx` + `listbox.test.ts`: `SearchInput`, `ListboxSearch`, `Listbox`, `ListboxGroup`, `ListboxOption`, `ListboxEmpty`, `listboxOptionClass`
- `packages/ui/src/table.ts` + `table.test.ts`: `tableClass`, `thClass`, `tdClass`
- `packages/ui/src/layout.tsx` also gets `PageShell`, `StickyToolbar`, `navPillClass` (Task 1.12)

**Create (app):** `src/ui-guard.test.ts`, the guard that fails on hand-rolled UI

**Modify (packages/ui):** `primitives.tsx`, `tokens.css`, `index.ts`

**Delete:** `src/components/field-trigger.tsx`, `src/components/ChevronBadge.tsx`

**Modify (app):**
- `Navbar.tsx`
- `__root.tsx`
- `index.tsx`, `tren.tsx`, `daya-beli.tsx`, `lapor.tsx`, `laporan.tsx`, `admin.tsx`
- `PriceTable.tsx`, `DatePicker.tsx`, `DayaBeliTable.tsx`, `daya-beli-tier.ts`
- `MoversList.tsx`, `ChartSummaryStrip.tsx`, `ChartHighlights.tsx`, `ProvincePanel.tsx`
- `LaporForm.tsx`, `LaporanList.tsx`, `AdminDesk.tsx`
- `CommoditySelect.tsx`, `PlaceSelect.tsx`, `LaporanProvince.tsx`
- `MapView.tsx`, `TrendChart.tsx`
- `src/lib/format.ts`, `src/lib/province-fill.ts`, `src/lib/chart-marks.ts`, `src/data/provider.ts`

**Docs:** `AGENTS.md` (Frontend UI system section) and `docs/superpowers/specs/2026-09-16-monitor-pangan-ui-mvp.md` (new "UI rules" section)

---

# PR 1 — `packages/ui` primitives and components (#23, #24, #25, #26 tokens, #27, #30)

Branch: `git checkout main && git pull && git checkout -b ui/phase-1-primitives`

### Task 1.1: Token values: border, ring, selected, z-scale

**Files:**
- Modify: `packages/ui/src/tokens.css`

- [ ] **Step 1: Edit `:root` and `@theme inline`**

In `:root`, replace the three lines for `--border`, `--input` and `--ring`, and add the z-scale:

```css
  --border: #e4e6df;
  --input: #e4e6df;
  --ring: #1a1c16;
  --z-toolbar: 40;
  --z-menu: 50;
```

In `@theme inline`, add this after `--color-leaf-deep: #00714c;`:

```css
  --color-selected: #e9ebe3;
```

- [ ] **Step 2: Typecheck and build CSS**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed. (Tailwind generates `bg-selected`.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/tokens.css
git commit -m "feat(ui): unify border tokens, darken ring, add selected and z tokens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.2: TS token mirror with a sync test

**Files:**
- Create: `packages/ui/src/tokens.ts`
- Test: `packages/ui/src/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/tokens.test.ts
import { readFileSync } from "node:fs"
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { color } from "./tokens.ts"

const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

it.effect("tokens.ts mirrors every color in tokens.css", () =>
  Effect.sync(() => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8")
    for (const [key, hex] of Object.entries(color)) {
      const match = css.match(new RegExp(`--color-${kebab(key)}:\\s*(#[0-9a-fA-F]{6});`))
      assert.isNotNull(match, `--color-${kebab(key)} missing from tokens.css`)
      assert.strictEqual(match![1]!.toLowerCase(), hex)
    }
  }),
)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test packages/ui/src/tokens.test.ts`
Expected: FAIL, "Cannot find module './tokens.ts'" or similar.

- [ ] **Step 3: Implement**

```ts
// packages/ui/src/tokens.ts
/**
 * Hex mirror of the color tokens in tokens.css, for places CSS variables cannot
 * reach (Leaflet path styles, SVG attributes). tokens.test.ts keeps them in sync.
 */
export const color = {
  canvas: "#f4f5f0",
  paper: "#ffffff",
  ink: "#1a1c16",
  slate: "#5c6358",
  hairline: "#e4e6df",
  ember: "#dc2626",
  emberSoft: "#fef2f2",
  heat: "#f97316",
  heatSoft: "#fff1e6",
  gold: "#eab308",
  goldSoft: "#fdf8e6",
  leaf: "#00bd7d",
  leafSoft: "#e7f6ef",
  leafDeep: "#00714c",
  selected: "#e9ebe3",
} as const

export type ColorToken = keyof typeof color
```

Add to `packages/ui/src/index.ts`:

```ts
export { color } from "./tokens.ts"
export type { ColorToken } from "./tokens.ts"
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test packages/ui/src/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/tokens.ts packages/ui/src/tokens.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add TS color token mirror with a css sync test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.3: Button primary and disabled variants, focus ring; input height and border

**Files:**
- Modify: `packages/ui/src/primitives.tsx`
- Test: `packages/ui/src/primitives.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/primitives.test.ts
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { buttonClass, inputClass, selectClass } from "./primitives.tsx"

const has = (classes: string, token: string): boolean => classes.split(" ").includes(token)

it.effect("every button variant has a focus ring and a visible disabled state", () =>
  Effect.sync(() => {
    for (const variant of ["pill", "rect", "primary"] as const) {
      const classes = buttonClass(variant)
      assert.isTrue(has(classes, "focus-visible:outline-2"), variant)
      assert.isTrue(has(classes, "focus-visible:outline-ring"), variant)
      assert.isTrue(has(classes, "disabled:opacity-50"), variant)
      assert.isTrue(has(classes, "disabled:active:scale-100"), variant)
    }
  }),
)

it.effect("primary is a leaf-deep fill and ignores active", () =>
  Effect.sync(() => {
    const classes = buttonClass("primary", true)
    assert.isTrue(has(classes, "bg-leaf-deep"))
    assert.isTrue(has(classes, "text-paper"))
    assert.isFalse(has(classes, "bg-ink"))
  }),
)

it.effect("inputs and selects share 44px height, radius and hairline border", () =>
  Effect.sync(() => {
    for (const classes of [inputClass(), selectClass()]) {
      assert.isTrue(has(classes, "min-h-11"))
      assert.isTrue(has(classes, "rounded-lg"))
      assert.isTrue(has(classes, "border-hairline"))
      assert.isTrue(has(classes, "focus-visible:outline-ring"))
    }
  }),
)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test packages/ui/src/primitives.test.ts`
Expected: FAIL. `"primary"` is not a valid `ButtonVariant` (type error at runtime is fine), and the focus assertions fail.

- [ ] **Step 3: Implement**

In `packages/ui/src/primitives.tsx`, replace `ButtonVariant` and `buttonClass`, and add `focusRing`:

```tsx
/** Keyboard focus ring shared by every interactive primitive. */
export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export type ButtonVariant = "pill" | "rect" | "primary"

export function buttonClass(variant: ButtonVariant = "pill", active = false, className?: string): string {
  return cn(
    "min-h-11 border text-sm font-semibold transition-transform active:scale-[0.96]",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    focusRing,
    variant === "pill" && "rounded-full px-4 py-2",
    variant === "rect" && "tabular-nums rounded-lg px-3 py-1.5",
    variant === "primary" && "rounded-lg px-4 py-2",
    variant === "primary"
      ? "border-leaf-deep bg-leaf-deep text-paper"
      : active
        ? "border-ink bg-ink text-white"
        : "border-hairline bg-paper text-ink",
    className,
  )
}
```

Replace `inputClass` and `selectClass`:

```tsx
export function inputClass(className?: string): string {
  return cn("min-h-11 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-sm", focusRing, className)
}

export function selectClass(className?: string): string {
  return cn("min-h-11 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-sm font-semibold", focusRing, className)
}
```

Add `focusRing` to the `index.ts` value export list.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm test packages/ui/src/primitives.test.ts && pnpm typecheck`
Expected: PASS. Typecheck is clean. Existing `"pill"`/`"rect"` callers are unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/primitives.tsx packages/ui/src/primitives.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add primary and disabled button states, shared focus ring, 44px inputs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.4: Move the field chrome into `packages/ui` and add FileInput

**Files:**
- Create: `packages/ui/src/field.tsx`
- Delete: `src/components/field-trigger.tsx`, `src/components/ChevronBadge.tsx`
- Modify imports in: `src/components/LaporForm.tsx`, `PlaceSelect.tsx`, `DatePicker.tsx`, `LaporanProvince.tsx`, `PriceTable.tsx`, `CommoditySelect.tsx`, `src/routes/tren.tsx`

- [ ] **Step 1: Create `packages/ui/src/field.tsx`**

```tsx
import { useId, useState, type ReactNode, type SelectHTMLAttributes } from "react"
import { Select, buttonClass, cardClass, cn, focusRing } from "./primitives.tsx"

const press =
  "transition-[scale,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

/** Padded chevron badge used as a select affordance. */
export function ChevronBadge({ flipped }: { flipped?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-slate"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "h-4 w-4 translate-y-px transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          flipped && "rotate-180",
        )}
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  )
}

/** Single-line combobox trigger. Same height, radius and border as Input and Select. */
export function fieldTriggerClass(className?: string): string {
  return cn(
    "flex h-11 w-full items-center gap-2 rounded-lg border border-hairline bg-paper pr-1.5 pl-3 text-left text-sm font-semibold text-ink",
    focusRing,
    press,
    className,
  )
}

/** Menu under a field trigger. It scales from the trigger, not from the center of the screen. */
export function fieldMenuClass(className?: string): string {
  return cardClass(
    "none",
    cn(
      "absolute inset-x-0 top-full z-(--z-menu) mt-1 origin-top overflow-hidden shadow-lg",
      "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:scale-95 starting:opacity-0",
      "motion-reduce:transition-none motion-reduce:starting:scale-100",
      className,
    ),
  )
}

type FieldSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  /** Keep the label for screen readers only, for dense toolbars. */
  hideLabel?: boolean
  wrapperClassName?: string
  children: ReactNode
}

/** Native select with the same chrome as the combobox trigger. The only select wrapper in the app. */
export function FieldSelect({ label, hideLabel = false, className, wrapperClassName, id, children, ...rest }: FieldSelectProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className={cn("flex flex-col gap-1", wrapperClassName)}>
      <label htmlFor={fieldId} className={cn("text-sm text-slate", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        <Select id={fieldId} className={cn("h-11 w-full appearance-none py-0 pr-12 pl-3 text-ink", className)} {...rest}>
          {children}
        </Select>
        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">
          <ChevronBadge />
        </span>
      </div>
    </div>
  )
}

type FileInputProps = {
  label: string
  accept?: string
  onFile: (file: File | null) => void
}

/** File picker styled as a rect button plus the chosen file name. The native input stays focusable. */
export function FileInput({ label, accept, onFile }: FileInputProps) {
  const [name, setName] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate">{label}</span>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring rounded-lg",
        )}
      >
        <input
          type="file"
          accept={accept}
          aria-label={label}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            setName(file?.name ?? null)
            onFile(file)
          }}
        />
        <span className={buttonClass("rect", false, "inline-flex items-center")}>Pilih foto</span>
        <span className="min-w-0 truncate text-slate">{name ?? "Belum ada foto"}</span>
      </label>
    </div>
  )
}
```

Add to `packages/ui/src/index.ts`:

```ts
export { ChevronBadge, FieldSelect, FileInput, fieldMenuClass, fieldTriggerClass } from "./field.tsx"
```

- [ ] **Step 2: Repoint the imports and delete the old files**

```bash
git rm src/components/field-trigger.tsx src/components/ChevronBadge.tsx
```

In each of these files, remove `import … from "#/components/field-trigger.tsx"` and `import { ChevronBadge } from "#/components/ChevronBadge.tsx"`, and add the same names to the existing `@monitor-pangan/ui` import:
- `src/components/LaporForm.tsx`
- `PlaceSelect.tsx`
- `DatePicker.tsx`
- `LaporanProvince.tsx`
- `PriceTable.tsx`
- `CommoditySelect.tsx`
- `src/routes/tren.tsx`

Example for `CommoditySelect.tsx`:

```tsx
import { ChevronBadge, fieldMenuClass, fieldTriggerClass } from "@monitor-pangan/ui"
```

Check that nothing still points at the old paths:

Run: `rg -n "field-trigger|components/ChevronBadge" src`
Expected: no output.

- [ ] **Step 3: Typecheck, build and browser check**

Run: `pnpm typecheck && pnpm build`
Expected: clean.

Browser check (`pnpm dev --port 3001`, `/lapor` at 1280): run the computed-style check below. The CommoditySelect trigger, the FieldSelect "Jenis tempat", the PlaceSelect trigger and the Harga input must all report `44 | 10px | rgb(228, 230, 223)`.

```js
[...document.querySelectorAll('main button, main input, main select')].map(el => { const s = getComputedStyle(el); return [el.tagName, el.getBoundingClientRect().height|0, s.borderRadius, s.borderTopColor].join(' | ') })
```

- [ ] **Step 4: Commit**

```bash
git add -A packages/ui/src src/components src/routes/tren.tsx
git commit -m "refactor(ui): move field chrome and ChevronBadge into packages/ui, add FileInput" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.5: SegmentedControl

**Files:**
- Create: `packages/ui/src/segmented.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Implement**

```tsx
// packages/ui/src/segmented.tsx
import { Button } from "./primitives.tsx"
import { cn } from "./primitives.tsx"

export type SegmentedOption<T extends string> = { value: T; label: string }

type SegmentedControlProps<T extends string> = {
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  itemClassName?: string
}

/** One-of-N toggle. Active option is ink, like every other selected control. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className, itemClassName }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Button
            key={option.value}
            variant="rect"
            active={active}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={itemClassName}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
```

Add to `index.ts`:

```ts
export { SegmentedControl } from "./segmented.tsx"
export type { SegmentedOption } from "./segmented.tsx"
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/segmented.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add SegmentedControl" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.6: Layout helpers: page shell, toolbar, headers, selected row

**Files:**
- Create: `packages/ui/src/layout.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Implement**

```tsx
// packages/ui/src/layout.tsx
import type { ReactNode } from "react"
import { cn } from "./primitives.tsx"

/** Main column for every route. */
export const pageShellClass = "mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4"

/** Sticky filter bar under the header. Sits above table sticky headers. */
export const stickyToolbarClass =
  "sticky top-0 z-(--z-toolbar) -mx-4 border-b border-hairline bg-canvas/90 px-4 py-2 backdrop-blur"

/** Small label above a value or a card body. */
export const eyebrowClass = "text-xs font-semibold text-slate"

/** Selected list or table row. Neutral, never a data color. */
export const selectedRowClass = "bg-selected shadow-[inset_3px_0_0_var(--color-ink)] hover:bg-selected"

type PageHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** Toolbar-first pages keep the heading for screen readers only. */
  visuallyHidden?: boolean
}

/** One h2 per route, the same size everywhere. */
export function PageHeader({ title, description, actions, visuallyHidden = false }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-3", visuallyHidden && "sr-only")}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {description != null ? <p className="text-sm text-slate">{description}</p> : null}
      </div>
      {actions}
    </header>
  )
}

type SectionHeaderProps = {
  title: ReactNode
  description?: ReactNode
  className?: string
}

/** Heading for a card or section inside a page. */
export function SectionHeader({ title, description, className }: SectionHeaderProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <h2 className="text-base font-bold">{title}</h2>
      {description != null ? <p className="text-sm text-slate">{description}</p> : null}
    </div>
  )
}
```

Add to `index.ts`:

```ts
export { PageHeader, SectionHeader, eyebrowClass, pageShellClass, selectedRowClass, stickyToolbarClass } from "./layout.tsx"
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/layout.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add page shell, toolbar, header and selected-row helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.7: StatusMessage

**Files:**
- Create: `packages/ui/src/status.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Implement**

```tsx
// packages/ui/src/status.tsx
import type { ReactNode } from "react"
import { cardClass, cn } from "./primitives.tsx"

export type StatusTone = "empty" | "error" | "loading"

type StatusMessageProps = {
  tone: StatusTone
  title: string
  children?: ReactNode
  action?: ReactNode
  /** Render inside an existing card without a second border. */
  bare?: boolean
  className?: string
}

function toneRole(tone: StatusTone): "status" | "alert" {
  switch (tone) {
    case "empty":
    case "loading":
      return "status"
    case "error":
      return "alert"
    default: {
      const _exhaustive: never = tone
      return _exhaustive
    }
  }
}

/** The single empty / error / loading block. Errors use ember text, never an ember fill. */
export function StatusMessage({ tone, title, children, action, bare = false, className }: StatusMessageProps) {
  return (
    <div
      role={toneRole(tone)}
      aria-busy={tone === "loading" || undefined}
      className={cn(bare ? "px-4 py-6" : cardClass("md"), "flex flex-col items-start gap-2 text-sm", className)}
    >
      <p className={cn("font-semibold", tone === "error" ? "text-ember" : "text-ink")}>{title}</p>
      {children != null ? <div className="text-slate">{children}</div> : null}
      {action}
    </div>
  )
}
```

Add to `index.ts`:

```ts
export { StatusMessage } from "./status.tsx"
export type { StatusTone } from "./status.tsx"
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add packages/ui/src/status.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add StatusMessage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.8: `Delta` — one direction glyph and color

Today the up/down/flat to color mapping is written four times: `ChartSummaryStrip.tsx:14`, `ChartHighlights.tsx:29`, `MoversList.tsx:84-90` and `PriceTable.tsx:124`. There are also three glyph sets. After this task, `Delta` is the only place that knows them.

**Files:**
- Create: `packages/ui/src/delta.tsx`
- Test: `packages/ui/src/delta.test.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/delta.test.ts
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { directionGlyph, directionTextClass } from "./delta.tsx"

it.effect("one glyph per direction", () =>
  Effect.sync(() => {
    assert.strictEqual(directionGlyph("up"), "▲")
    assert.strictEqual(directionGlyph("down"), "▼")
    assert.strictEqual(directionGlyph("flat"), "•")
  }),
)

it.effect("price up is ember, price down is leaf-deep, flat is slate", () =>
  Effect.sync(() => {
    assert.strictEqual(directionTextClass("up"), "text-ember")
    assert.strictEqual(directionTextClass("down"), "text-leaf-deep")
    assert.strictEqual(directionTextClass("flat"), "text-slate")
  }),
)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test packages/ui/src/delta.test.ts`
Expected: FAIL, cannot resolve `./delta.tsx`.

- [ ] **Step 3: Implement**

```tsx
// packages/ui/src/delta.tsx
import type { ReactNode } from "react"
import { cn } from "./primitives.tsx"

/** Price movement direction. Structurally equal to the app's TrendDirection. */
export type Direction = "up" | "down" | "flat"

export function directionGlyph(direction: Direction): string {
  switch (direction) {
    case "up":
      return "▲"
    case "down":
      return "▼"
    case "flat":
      return "•"
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

/** A rising food price is bad news (ember), a falling one is good news (leaf-deep). */
export function directionTextClass(direction: Direction): string {
  switch (direction) {
    case "up":
      return "text-ember"
    case "down":
      return "text-leaf-deep"
    case "flat":
      return "text-slate"
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

type DeltaProps = {
  direction: Direction
  /** Already formatted text, e.g. formatPct(x) or "+44,7% · Rp1.200/kg". */
  children: ReactNode
  className?: string
}

/** Colored glyph plus value. The only way to show a price change. */
export function Delta({ direction, children, className }: DeltaProps) {
  return (
    <span className={cn("tabular-nums font-semibold", directionTextClass(direction), className)}>
      <span aria-hidden="true">{directionGlyph(direction)} </span>
      {children}
    </span>
  )
}
```

Add to `index.ts`:

```ts
export { Delta, directionGlyph, directionTextClass } from "./delta.tsx"
export type { Direction } from "./delta.tsx"
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test packages/ui/src/delta.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/delta.tsx packages/ui/src/delta.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add Delta for price direction glyph and color" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.9: `Panel` — card with a header bar

`PriceTable.tsx:53`, `MoversList.tsx:28,53` and `DayaBeliTable.tsx:78` each hand-build a card with a `border-b border-hairline px-4 py-3` header holding a title, a description and optional controls. `Panel` replaces all of them.

**Files:**
- Create: `packages/ui/src/panel.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Implement**

```tsx
// packages/ui/src/panel.tsx
import type { ReactNode } from "react"
import { SectionHeader } from "./layout.tsx"
import { cardClass, cn } from "./primitives.tsx"

type PanelProps = {
  title: ReactNode
  description?: ReactNode
  /** Controls on the right of the header (search, sort). They stack under the title on mobile. */
  toolbar?: ReactNode
  /** Full-width row under the title and toolbar, e.g. a legend. */
  headerExtra?: ReactNode
  /** Dims the panel and sets aria-busy while data reloads. */
  busy?: boolean
  "aria-label"?: string
  className?: string
  children: ReactNode
}

/** Card section with a header bar. Use for every table or list block. */
export function Panel({ title, description, toolbar, headerExtra, busy = false, className, children, ...rest }: PanelProps) {
  return (
    <section
      aria-label={rest["aria-label"]}
      aria-busy={busy || undefined}
      className={cardClass("none", cn("overflow-hidden", busy && "opacity-70", className))}
    >
      <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <SectionHeader title={title} description={description} />
          {toolbar != null ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{toolbar}</div>
          ) : null}
        </div>
        {headerExtra}
      </div>
      {children}
    </section>
  )
}
```

Add to `index.ts`:

```ts
export { Panel } from "./panel.tsx"
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add packages/ui/src/panel.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add Panel for card sections with a header bar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.10: `StatList` and `Stat`

`ChartSummaryStrip.tsx:58-85` and `DayaBeliSummary.tsx:92-118` repeat the same `dt text-xs font-semibold text-slate` / `dd tabular-nums text-sm font-bold` / `dd text-xs text-slate` triplet.

**Files:**
- Create: `packages/ui/src/stat.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Implement**

```tsx
// packages/ui/src/stat.tsx
import type { ReactNode } from "react"
import { eyebrowClass } from "./layout.tsx"
import { cn } from "./primitives.tsx"

type StatListProps = {
  /** 3 = 2 cols on mobile, 3 from sm. 4 = 2 cols on mobile, 4 from lg. */
  columns?: 3 | 4
  className?: string
  children: ReactNode
}

export function StatList({ columns = 4, className, children }: StatListProps) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3", columns === 3 ? "sm:grid-cols-3" : "lg:grid-cols-4", className)}>
      {children}
    </dl>
  )
}

type StatProps = {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** Accent bar on the left, e.g. the lowest affordability. */
  accent?: "ember" | "leaf-deep"
}

/** One label / value / hint triple inside a StatList. */
export function Stat({ label, value, hint, accent }: StatProps) {
  return (
    <div className={cn(accent != null && "relative pl-3")}>
      {accent != null ? (
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 w-0.5", accent === "ember" ? "bg-ember" : "bg-leaf-deep")}
        />
      ) : null}
      <dt className={eyebrowClass}>{label}</dt>
      <dd className="tabular-nums text-sm font-bold text-ink">{value}</dd>
      {hint != null ? <dd className="tabular-nums mt-0.5 text-xs text-slate">{hint}</dd> : null}
    </div>
  )
}
```

Add to `index.ts`:

```ts
export { Stat, StatList } from "./stat.tsx"
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add packages/ui/src/stat.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add StatList and Stat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.11: `SearchInput` and the listbox pieces

There are four `type="search"` inputs: `PriceTable.tsx:62`, `DayaBeliTable.tsx:87`, `CommoditySelect.tsx:98` and `PlaceSelect.tsx:109`. `CommoditySelect.tsx:113-180` and `PlaceSelect.tsx:117,152-170` also each build their own option rows, group labels and "no match" rows.

**Files:**
- Create: `packages/ui/src/listbox.tsx`
- Test: `packages/ui/src/listbox.test.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/listbox.test.ts
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { listboxOptionClass } from "./listbox.tsx"

it.effect("selected option uses the neutral selected tint, never ember", () =>
  Effect.sync(() => {
    const selected = listboxOptionClass(true)
    assert.isTrue(selected.includes("bg-selected"))
    assert.isFalse(selected.includes("ember"))
    assert.isTrue(listboxOptionClass(false).includes("hover:bg-muted"))
  }),
)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test packages/ui/src/listbox.test.ts`
Expected: FAIL, cannot resolve `./listbox.tsx`.

- [ ] **Step 3: Implement**

```tsx
// packages/ui/src/listbox.tsx
import type { ReactNode, Ref } from "react"
import { selectedRowClass } from "./layout.tsx"
import { Input, cn } from "./primitives.tsx"

type SearchInputProps = {
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  ref?: Ref<HTMLInputElement>
}

/** The one search box. `label` is the accessible name. */
export function SearchInput({ label, value, onValueChange, placeholder, className, ref }: SearchInputProps) {
  return (
    <Input
      ref={ref}
      type="search"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className={cn("w-full", className)}
    />
  )
}

/** Search box pinned at the top of a field menu. */
export function ListboxSearch(props: SearchInputProps) {
  return (
    <div className="border-b border-hairline p-2">
      <SearchInput {...props} />
    </div>
  )
}

type ListboxProps = {
  id: string
  label: string
  children: ReactNode
}

export function Listbox({ id, label, children }: ListboxProps) {
  return (
    <ul id={id} role="listbox" aria-label={label} className="max-h-72 overflow-auto py-1">
      {children}
    </ul>
  )
}

export function listboxOptionClass(selected: boolean): string {
  return cn(
    "flex h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium",
    "transition-[background-color] duration-150 ease-out",
    selected ? selectedRowClass : "hover:bg-muted",
  )
}

type ListboxOptionProps = {
  selected: boolean
  onSelect: () => void
  /** Right-aligned secondary text, e.g. a price hint. */
  trailing?: ReactNode
  children: ReactNode
}

/** One row in a field menu. Renders its own <li>. */
export function ListboxOption({ selected, onSelect, trailing, children }: ListboxOptionProps) {
  return (
    <li>
      <button type="button" role="option" aria-selected={selected} onClick={onSelect} className={listboxOptionClass(selected)}>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("h-4 w-4 shrink-0 text-ink", selected ? "opacity-100" : "opacity-0")}
        >
          <path d="m3 8.5 3.5 3.5L13 4.5" />
        </svg>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {trailing != null ? <span className="tabular-nums shrink-0 font-normal text-slate">{trailing}</span> : null}
      </button>
    </li>
  )
}

/** Group heading inside a Listbox. Wrap the group's options in the returned <li>'s <ul>. */
export function ListboxGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li>
      <p className="px-4 pt-2 pb-1 text-xs font-semibold text-slate">{label}</p>
      <ul>{children}</ul>
    </li>
  )
}

export function ListboxEmpty({ children }: { children: ReactNode }) {
  return <li className="px-4 py-3 text-sm text-slate">{children}</li>
}
```

Add to `index.ts`:

```ts
export {
  Listbox,
  ListboxEmpty,
  ListboxGroup,
  ListboxOption,
  ListboxSearch,
  SearchInput,
  listboxOptionClass,
} from "./listbox.tsx"
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test packages/ui/src/listbox.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/listbox.tsx packages/ui/src/listbox.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add SearchInput and listbox building blocks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.12: `PageShell`, `StickyToolbar`, `navPillClass` and table cells

Route code should not paste class strings. This task wraps the Task 1.6 constants in components. It also adds the nav pill class and shared table cell classes, because `PriceTable.tsx:87-91` and `DayaBeliTable.tsx:153-162` style their headers differently (uppercase versus not).

**Files:**
- Modify: `packages/ui/src/layout.tsx`
- Create: `packages/ui/src/table.ts`
- Test: `packages/ui/src/table.test.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ui/src/table.test.ts
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import { tdClass, thClass } from "./table.ts"

it.effect("header cells share one style and align numbers right", () =>
  Effect.sync(() => {
    assert.isTrue(thClass("start").includes("bg-muted"))
    assert.isTrue(thClass("end").includes("text-right"))
    assert.isFalse(thClass("start").includes("uppercase"))
  }),
)

it.effect("numeric body cells never wrap", () =>
  Effect.sync(() => {
    const cell = tdClass("end")
    assert.isTrue(cell.includes("tabular-nums"))
    assert.isTrue(cell.includes("whitespace-nowrap"))
    assert.isTrue(cell.includes("text-right"))
  }),
)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test packages/ui/src/table.test.ts`
Expected: FAIL, cannot resolve `./table.ts`.

- [ ] **Step 3: Implement the table helpers**

```ts
// packages/ui/src/table.ts
import { cn } from "./primitives.tsx"

export type CellAlign = "start" | "end"

export const tableClass = "w-full border-separate border-spacing-0 text-left text-sm"

/** Header cell. `end` is for numeric columns. */
export function thClass(align: CellAlign = "start", className?: string): string {
  return cn(
    "border-b border-hairline bg-muted px-4 py-2 text-xs font-semibold whitespace-nowrap text-slate",
    align === "end" ? "text-right" : "text-left",
    className,
  )
}

/** Body cell. `end` cells are numeric: tabular, right-aligned, never wrapped. */
export function tdClass(align: CellAlign = "start", className?: string): string {
  return cn(
    "border-b border-hairline px-4 py-2",
    align === "end" ? "tabular-nums text-right whitespace-nowrap" : "text-left",
    className,
  )
}
```

`border-separate border-spacing-0` is what DayaBeliTable already uses so sticky cells keep their borders. PriceTable adopts it too, and its row `border-t` moves onto `tdClass`'s `border-b`.

- [ ] **Step 4: Add the layout components to `layout.tsx`**

Append:

```tsx
import { buttonClass } from "./primitives.tsx"

type ShellProps = { className?: string; children: ReactNode }

/** <main> for every route. Pass `className="max-w-md"` for narrow forms. */
export function PageShell({ className, children }: ShellProps) {
  return <main className={cn(pageShellClass, className)}>{children}</main>
}

/** Sticky filter bar. Children lay out in a wrapping row. */
export function StickyToolbar({ className, children }: ShellProps) {
  return (
    <div className={cn(stickyToolbarClass, className)}>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </div>
  )
}

/** Nav link pill. Apply to the router <Link> itself, so the hit area equals the pill. */
export function navPillClass(active: boolean): string {
  return buttonClass("pill", active, "inline-flex shrink-0 items-center whitespace-nowrap")
}
```

Merge the new `import { buttonClass }` into the existing `./primitives.tsx` import at the top of `layout.tsx`, so it reads `import { buttonClass, cn } from "./primitives.tsx"`.

Update the `layout.tsx` export line in `index.ts`, and add the table exports:

```ts
export {
  PageHeader,
  PageShell,
  SectionHeader,
  StickyToolbar,
  eyebrowClass,
  navPillClass,
  pageShellClass,
  selectedRowClass,
  stickyToolbarClass,
} from "./layout.tsx"
export { tableClass, tdClass, thClass } from "./table.ts"
export type { CellAlign } from "./table.ts"
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm test packages/ui/src/table.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/layout.tsx packages/ui/src/table.ts packages/ui/src/table.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add PageShell, StickyToolbar, nav pill and table cell helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 1.13: PR 1 gates and PR

- [ ] **Step 1: Gates**

Run: `pnpm typecheck && pnpm test packages/ui/src/tokens.test.ts packages/ui/src/primitives.test.ts packages/ui/src/delta.test.ts packages/ui/src/listbox.test.ts packages/ui/src/table.test.ts && pnpm build`
Expected: all green. No app file changed except the import repoints from Task 1.4.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin ui/phase-1-primitives
gh pr create --base main --title "UI phase 1: shared primitives, tokens and components" --body "Part of #31. Adds the packages/ui building blocks for #23 #24 #25 #26 #27 #30: tokens, Button primary, FieldSelect, FileInput, SegmentedControl, PageShell, StickyToolbar, PageHeader, SectionHeader, Panel, StatList, Delta, SearchInput, Listbox, table cells, StatusMessage. Adoption lands in phase 2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
# then register the PR URL in T3 Code with link_pull_request
```

---

# PR 2 — Adoption in routes and components (#22, #23, #24, #25, #26, #27, #30)

Branch: `git checkout main && git pull && git checkout -b ui/phase-2-adoption` (after PR 1 merges)

### Task 2.0: Guard test that keeps the app on shared components

Write this first. It fails on `main` and lists every hand-rolled pattern. Each later task in this PR removes some of those patterns, and it must pass at the PR 2 gate. After that it stops regressions: a new hand-made select, search box, option row, stat, hex color, `<main>` or toolbar fails CI.

**Files:**
- Test: `src/ui-guard.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/ui-guard.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { assert, it } from "@effect/vitest"

const SRC = fileURLToPath(new URL(".", import.meta.url))

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(name) || /\.(test|gen)\.tsx?$/.test(name)) return []
    return [path]
  })

type Rule = { pattern: RegExp; use: string; allow?: readonly string[]; only?: string }

/** Hand-rolled UI that has a shared replacement in @monitor-pangan/ui. */
const RULES: readonly Rule[] = [
  { pattern: /appearance-none|<Select\b/, use: "FieldSelect" },
  { pattern: /type="search"/, use: "SearchInput / ListboxSearch" },
  { pattern: /role="option"/, use: "ListboxOption" },
  { pattern: /<dt\b/, use: "StatList + Stat" },
  { pattern: /active=\{/, use: "SegmentedControl" },
  { pattern: /#[0-9a-fA-F]{6}\b/, use: "color from @monitor-pangan/ui", allow: ["seo.ts"] },
  {
    pattern: /bg-ember-soft/,
    use: "selectedRowClass (ember is data meaning only)",
    allow: ["components/daya-beli-tier.ts", "components/DayaBeliSummary.tsx"],
  },
  { pattern: /<main\b/, use: "PageShell", only: "routes/", allow: ["routes/__root.tsx"] },
  { pattern: /sticky top-0 z-/, use: "StickyToolbar", only: "routes/" },
  { pattern: /#\/components\/(field-trigger|ChevronBadge)/, use: "@monitor-pangan/ui" },
]

it.effect("app code uses shared ui components instead of hand-rolled ones", () =>
  Effect.sync(() => {
    const violations: string[] = []
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file)
      const lines = readFileSync(file, "utf8").split("\n")
      for (const rule of RULES) {
        if (rule.only != null && !rel.startsWith(rule.only)) continue
        if (rule.allow?.some((allowed) => rel.endsWith(allowed))) continue
        lines.forEach((line, index) => {
          if (rule.pattern.test(line)) violations.push(`${rel}:${index + 1} → use ${rule.use}`)
        })
      }
    }
    assert.deepStrictEqual(violations, [])
  }),
)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/ui-guard.test.ts`
Expected: FAIL. The diff lists the current violations, e.g. `components/PriceTable.tsx:62 → use SearchInput / ListboxSearch`, `routes/tren.tsx:109 → use StickyToolbar`, `lib/province-fill.ts:2 → use color from @monitor-pangan/ui`.

- [ ] **Step 3: Commit the failing guard**

Commit it on the branch. Tasks 2.1–2.8 may run `pnpm test src/ui-guard.test.ts` to watch the list shrink. It stays red until Task 2.9, so do not "fix" it early by allowlisting. CI only runs on the PR, which is opened after Task 2.9.

```bash
git add src/ui-guard.test.ts
git commit -m "test: guard against hand-rolled ui that has a shared component" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.1: Navbar puts the class on the Link and scrolls on mobile (#22)

**Files:**
- Modify: `src/components/Navbar.tsx`

- [ ] **Step 1: Replace the component body**

```tsx
import { Link, useSearch } from "@tanstack/react-router"
import { navPillClass } from "@monitor-pangan/ui"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"

const linkProps = {
  activeProps: { className: navPillClass(true) },
  inactiveProps: { className: navPillClass(false) },
}

/** Primary route switcher. The pill is the link, so the hit area equals the visible chip. */
export function Navbar() {
  const raw = useSearch({ strict: false })
  const search = parseCommoditySearch(raw as Record<string, unknown>)
  return (
    <nav
      aria-label="Navigasi utama"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
    >
      <Link to="/" search={search} activeOptions={{ exact: true }} {...linkProps}>
        Peta
      </Link>
      <Link to="/tren" search={search} {...linkProps}>
        Grafik
      </Link>
      <Link to="/daya-beli" search={search} {...linkProps}>
        Daya Beli
      </Link>
      <Link to="/laporan" activeOptions={{ includeSearch: false }} {...linkProps}>
        Laporan Warga
      </Link>
    </nav>
  )
}
```

- [ ] **Step 2: Typecheck and browser check**

Run: `pnpm typecheck`

At 1280 and 390, check: `[...document.querySelectorAll('nav a')].map(a => a.getBoundingClientRect().height|0)`
Expected: every value is ≥ 44. At 390 the labels stay on one line, the row scrolls sideways if needed, and Tab shows an ink ring.

- [ ] **Step 3: Commit**

```bash
git add src/components/Navbar.tsx
git commit -m "fix(nav): style the link itself so the hit area matches the pill, scroll on mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.2: Header badge tone (#26)

**Files:**
- Modify: `src/data/provider.ts` (next to `dataBadge`, line ~313)
- Modify: `src/routes/__root.tsx`
- Test: `src/data/provider.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/data/provider.test.ts`. Add `dataBadgeTone` to its existing `./provider.ts` import, and add `Effect`/`assert`/`it` imports if they're missing.

```ts
it.effect("header badge warns only for sample data", () =>
  Effect.sync(() => {
    assert.strictEqual(dataBadgeTone("Data contoh"), "ember")
    assert.strictEqual(dataBadgeTone("Data 16 September 2026 · PIHPS eceran"), "neutral")
  }),
)
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/data/provider.test.ts`
Expected: FAIL, `dataBadgeTone` is not exported.

- [ ] **Step 3: Implement**

In `src/data/provider.ts`, below `dataBadge`:

```ts
/** Ember only when the header shows sample data. Live PIHPS dates are informational. */
export function dataBadgeTone(badge: string): "ember" | "neutral" {
  return badge === "Data contoh" ? "ember" : "neutral"
}
```

In `src/routes/__root.tsx`, import `dataBadgeTone` from `"../data/provider.ts"` and change the badge:

```tsx
<Badge tone={dataBadgeTone(badge)} className="ml-auto">
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test src/data/provider.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/provider.ts src/data/provider.test.ts src/routes/__root.tsx
git commit -m "fix(header): keep ember for sample data only, neutral for live PIHPS dates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.3: Replace hardcoded hex with token values (#26)

**Files:**
- Modify: `src/lib/province-fill.ts`, `src/lib/chart-marks.ts`, `src/components/MapView.tsx`

- [ ] **Step 1: Edit `province-fill.ts`**

```ts
import { color } from "@monitor-pangan/ui"

export const PRICE_BANDS = [
  { below: 0.9, color: color.leafDeep, label: "Jauh di bawah rata-rata" },
  { below: 0.97, color: color.leaf, label: "Di bawah rata-rata" },
  { below: 1.03, color: color.gold, label: "Sekitar rata-rata" },
  { below: 1.1, color: color.heat, label: "Di atas rata-rata" },
  { below: Number.POSITIVE_INFINITY, color: color.ember, label: "Jauh di atas rata-rata" },
] as const

export function provinceFill(
  price: number | null | undefined,
  average: number,
): { fillColor: string; fillOpacity: number } {
  if (price == null) return { fillColor: color.ink, fillOpacity: 0.9 }
  const ratio = average === 0 ? 1 : price / average
  const fillColor = PRICE_BANDS.find((band) => ratio < band.below)?.color ?? color.gold
  return { fillColor, fillOpacity: 0.65 }
}
```

- [ ] **Step 2: Edit `chart-marks.ts` `markPaint`**

Add `import { color } from "@monitor-pangan/ui"` at the top, and replace the switch cases:

```ts
    case "up":
      return { fill: color.ember, stroke: color.ember }
    case "down":
      return { fill: color.leafDeep, stroke: color.leafDeep }
    case "flat":
      return { fill: color.paper, stroke: color.ink }
    case "gap":
      return { fill: color.ink, stroke: color.ink }
```

- [ ] **Step 3: Edit `MapView.tsx`**

Add `color` to the `@monitor-pangan/ui` import. Replace every `"#ffffff"` with `color.paper` and every `"#1a1c16"` with `color.ink` (lines 54, 66, 72).

- [ ] **Step 4: Run the existing tests**

They pin the same hex values, so they prove nothing changed visually.

Run: `pnpm test src/lib/province-fill.test.ts src/lib/chart-marks.test.ts && rg -n "#[0-9a-fA-F]{6}" src --glob '!*.test.ts' --glob '!*.gen.ts'`
Expected: tests PASS. The `rg` prints only `src/seo.ts:2` (`THEME_COLOR`, a `<meta name="theme-color">` string, which is intentional).

- [ ] **Step 5: Commit**

```bash
git add src/lib/province-fill.ts src/lib/chart-marks.ts src/components/MapView.tsx
git commit -m "refactor: read map and chart colors from the shared token mirror" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.4: Rebuild the data blocks on shared components (#23, #26, #27, #28, #30)

This task moves every duplicated block onto the Phase 1 components:

| Block | Old (hand-built) | New |
|---|---|---|
| PriceTable | card, header bar, `type="search"`, raw select, uppercase `th`, ember row | `Panel`, `SearchInput`, `FieldSelect`, `thClass`/`tdClass`, `selectedRowClass`, `Delta` |
| MoversList | card, header bar ×2, ember row, glyph if-chain | `Panel`, `StatusMessage`, `selectedRowClass`, `Delta` |
| ChartSummaryStrip | `dl/dt/dd` by hand, local color and glyph switches | `StatList`, `Stat`, `Delta`, `StatusMessage` |
| ChartHighlights | local color and glyph switches, h2 eyebrow | `Delta`, `eyebrowClass` h3 |
| DayaBeliSummary | `dl/dt/dd` by hand | `StatList`, `Stat accent` |
| DayaBeliTable | card, header bar, `type="search"`, `th` strings | `Panel`, `SearchInput`, `thClass` |
| CommoditySelect, PlaceSelect | search box, options, group label, empty row | `ListboxSearch`, `Listbox`, `ListboxGroup`, `ListboxOption`, `ListboxEmpty` |

**Files:**
- Modify: `src/components/PriceTable.tsx`, `MoversList.tsx`, `ChartSummaryStrip.tsx`, `ChartHighlights.tsx`, `DayaBeliSummary.tsx`, `DayaBeliTable.tsx`, `CommoditySelect.tsx`, `PlaceSelect.tsx`

- [ ] **Step 1: PriceTable**

Set the imports to:

```tsx
import { useMemo, useState } from "react"
import {
  Delta,
  FieldSelect,
  Panel,
  SearchInput,
  cn,
  selectedRowClass,
  tableClass,
  tdClass,
  thClass,
} from "@monitor-pangan/ui"
import { formatDateShort, formatPct, formatPrice, trendDirection } from "#/lib/format.ts"
import type { PriceUnit } from "#/data/catalog.ts"
```

Keep the types, the state and `visible` unchanged. Replace the whole `return (…)` with:

```tsx
  return (
    <Panel
      title={`Harga ${commodityName} per provinsi`}
      description={
        <span className="tabular-nums">
          {formatDateShort(date)} · {visible.length} dari {rows.length}
        </span>
      }
      toolbar={
        <>
          <SearchInput
            label="Cari provinsi"
            value={query}
            onValueChange={setQuery}
            placeholder="Cari provinsi…"
            className="sm:w-56"
          />
          <FieldSelect
            label="Urutkan"
            hideLabel
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            wrapperClassName="w-full sm:w-44"
          >
            <option value="price-desc">Termahal dulu</option>
            <option value="price-asc">Termurah dulu</option>
            <option value="name">Nama A–Z</option>
          </FieldSelect>
        </>
      }
    >
      <div className="max-h-[480px] overflow-auto">
        <table className={tableClass}>
          <thead className="sticky top-0">
            <tr>
              <th className={thClass("start")}>Provinsi</th>
              <th className={thClass("end")}>Harga</th>
              <th className={thClass("end")}>vs Rata-rata</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const price = r.price
              const missing = price == null
              const diff = missing || average === 0 ? 0 : ((price - average) / average) * 100
              return (
                <tr
                  key={r.regionCode}
                  tabIndex={0}
                  aria-selected={r.regionCode === selectedCode}
                  onClick={() => onSelect(r.regionCode)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelect(r.regionCode)
                    }
                  }}
                  className={cn(
                    "cursor-pointer transition-[background-color] duration-150 ease-out hover:bg-muted",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    r.regionCode === selectedCode && selectedRowClass,
                  )}
                >
                  <td className={tdClass("start", "font-medium")}>{r.name}</td>
                  <td className={tdClass("end", "font-semibold")}>
                    {missing ? "Tidak ada data" : formatPrice(price, unit)}
                  </td>
                  <td className={tdClass("end")}>
                    {missing ? (
                      <span className="text-slate">—</span>
                    ) : (
                      <Delta direction={trendDirection(diff)}>{formatPct(diff)}</Delta>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
```

This also covers the PriceTable parts of #29: the toolbar stacks below `sm`, and numeric cells use `whitespace-nowrap`.

- [ ] **Step 2: MoversList**

Replace the whole file body below the `MoversListProps` type with:

```tsx
const DESCRIPTION = "Nasional, urut dari perubahan terbesar"

/** National movers over a labeled range, grouped by direction, biggest change first. */
export function MoversList({ items, activeId, onSelect, rangeLabel }: MoversListProps) {
  const title = `Pergerakan ${rangeLabel}`
  if (items.length === 0) {
    return (
      <Panel title={title} description={DESCRIPTION}>
        <StatusMessage tone="empty" title="Belum ada data." bare />
      </Panel>
    )
  }

  const up = items
    .filter((item) => item.direction === "up")
    .sort((a, b) => b.changePct - a.changePct)
  const down = items
    .filter((item) => item.direction === "down")
    .sort((a, b) => a.changePct - b.changePct)
  const flat = items.filter((item) => item.direction === "flat")

  const groups: Array<{ title: string; rows: MoverItem[] }> = [
    { title: "Naik", rows: up },
    { title: "Turun", rows: down },
  ]
  if (flat.length > 0) groups.push({ title: "Stabil", rows: flat })

  return (
    <Panel title={title} description={DESCRIPTION}>
      {groups.map((group) =>
        group.rows.length === 0 ? null : (
          <div key={group.title} className="border-b border-hairline last:border-b-0">
            <h3 className={cn(eyebrowClass, "px-4 pt-3")}>{group.title}</h3>
            <ul>
              {group.rows.map((item) => {
                const active = item.commodityId === activeId
                return (
                  <li key={item.commodityId}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.commodityId)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-left tabular-nums hover:bg-muted",
                        "outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                        active && selectedRowClass,
                      )}
                    >
                      <span className="flex flex-col leading-tight">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-sm text-slate">{formatPrice(item.lastPrice, item.unit)}</span>
                      </span>
                      <Delta direction={item.direction} className="text-sm">
                        {formatPct(item.changePct)}
                      </Delta>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ),
      )}
    </Panel>
  )
}
```

Set the imports to:

```tsx
import { Delta, Panel, StatusMessage, cn, eyebrowClass, selectedRowClass } from "@monitor-pangan/ui"
import { formatPct, formatPrice } from "#/lib/format.ts"
import type { PriceUnit } from "#/data/catalog.ts"
import type { TrendDirection } from "#/data/provider.ts"
```

- [ ] **Step 3: ChartSummaryStrip**

Delete `directionClass`, `directionMark` and the `TrendDirection` import. Set the imports to:

```tsx
import { Delta, Stat, StatList, StatusMessage, cardClass } from "@monitor-pangan/ui"
import type { PriceUnit } from "#/data/catalog.ts"
import type { ChartStrip } from "#/lib/chart-summary.ts"
import type { TrendResolution } from "#/data/provider.ts"
import { formatPct, formatPrice, formatRupiah, formatSeriesDate } from "#/lib/format.ts"
```

Replace the component with:

```tsx
/** Four-callout strip above the chart: Terakhir, Perubahan, Termurah, Termahal. */
export function ChartSummaryStrip({ strip, unit, resolution, limitedCopy }: ChartSummaryStripProps) {
  if (strip.kind === "empty") {
    return (
      <section aria-label="Ringkasan grafik">
        <StatusMessage tone="empty" title={limitedCopy ?? "Belum ada data tren untuk rentang ini."} />
      </section>
    )
  }

  return (
    <section aria-label="Ringkasan grafik" className={cardClass("md")}>
      {limitedCopy != null ? <p className="mb-3 text-sm text-slate">{limitedCopy}</p> : null}
      <StatList columns={4}>
        <Stat
          label="Terakhir"
          value={formatPrice(strip.sekarang!.price, unit)}
          hint={formatSeriesDate(strip.sekarang!.date, resolution)}
        />
        {strip.delta != null ? (
          <Stat
            label="Perubahan"
            value={
              <Delta direction={strip.delta.direction} className="font-bold">
                {formatPct(strip.delta.pct)} · {formatRupiah(strip.delta.rp, true)}
              </Delta>
            }
          />
        ) : null}
        {strip.termurah != null ? (
          <Stat
            label="Termurah"
            value={formatPrice(strip.termurah.price, unit)}
            hint={formatSeriesDate(strip.termurah.date, resolution)}
          />
        ) : null}
        {strip.termahal != null ? (
          <Stat
            label="Termahal"
            value={formatPrice(strip.termahal.price, unit)}
            hint={formatSeriesDate(strip.termahal.date, resolution)}
          />
        ) : null}
      </StatList>
    </section>
  )
}
```

- [ ] **Step 4: ChartHighlights**

Delete `directionClass` and `directionMark`. Set the ui import to `import { Delta, cardClass, eyebrowClass } from "@monitor-pangan/ui"`. Replace `MoveBody`'s first `<p>` with:

```tsx
      <p className="mt-1 text-sm">
        <Delta direction={trendDirection(move.pct)} className="font-bold">
          {formatPct(move.pct)} · {formatRupiah(move.rp, true)}/{unit}
        </Delta>
      </p>
```

Replace the card title `<h2 className="text-xs font-semibold text-slate">{card.title}</h2>` with `<h3 className={eyebrowClass}>{card.title}</h3>`.

- [ ] **Step 5: DayaBeliSummary**

Set the ui import to `import { Badge, Stat, StatList, cardClass, cn } from "@monitor-pangan/ui"`. Replace the `<dl className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3">…</dl>` block with:

```tsx
          <StatList columns={3} className="px-5 py-4">
            {showLow ? (
              <Stat
                label="Terendah"
                accent="ember"
                value={
                  <>
                    {lowest.amount} {unit}
                  </>
                }
                hint={
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{lowest.name}</span>
                    <Badge tone="neutral" className={tierChipClass(lowTier)} title={tierLabel(lowTier)}>
                      <span className="sr-only">{tierLabel(lowTier)} </span>#{lowest.rank}
                    </Badge>
                  </span>
                }
              />
            ) : null}
            <Stat
              label="Provinsi berdata"
              value={
                <>
                  {ranked} dari {total}
                </>
              }
            />
            <Stat label="Acuan upah" value={`UMP ${wageYear}`} hint="pekerja formal" />
          </StatList>
```

If `cn` becomes unused, drop it from the import.

- [ ] **Step 6: DayaBeliTable**

Set the ui import to `import { Badge, Button, Panel, SearchInput, cn, thClass } from "@monitor-pangan/ui"`. `cardClass` and `Input` are no longer used. `Button` stays until Task 2.6.

Replace the opening `<section aria-busy={busy} className={cardClass(…)}>` and the whole header `<div className="flex flex-col gap-3 border-b border-hairline px-4 py-3">…</div>` (lines 74–127) with:

```tsx
    <Panel
      title="Per provinsi"
      busy={busy}
      description={
        <span className="tabular-nums">
          {commodityName} · {formatDateShort(priceDate)} · {visible.length} dari {rows.length} · {ranked} ada datanya
        </span>
      }
      toolbar={
        <>
          <SearchInput
            label="Cari provinsi"
            value={query}
            onValueChange={setQuery}
            placeholder="Cari provinsi…"
            className="lg:max-w-xs"
          />
          {SORT_GROUP}
        </>
      }
      headerExtra={LEGEND}
    >
```

`{SORT_GROUP}` stands for the current `<div role="group" aria-label="Urutkan daya beli" …>…</div>` block (lines 94–113), moved in unchanged. Task 2.6 replaces it. `{LEGEND}` stands for the current `<ul aria-label="Skala daya beli" …>…</ul>` block (lines 115–126), moved in unchanged. Paste both inline. Do not create constants.

Change the component's closing `</section>` to `</Panel>`.

In the table head, change `<tr className="text-xs uppercase text-slate">` to `<tr>`, and replace the four `th` classNames:

```tsx
<th className={thClass("start", "sticky top-0 left-0 z-30 border-r")}>Provinsi</th>
<th className={thClass("end", "sticky top-0 z-20")}>Daya beli pekerja formal</th>
<th className={thClass("end", "sticky top-0 z-20")}>Harga rata-rata provinsi</th>
<th className={thClass("end", "sticky top-0 z-20")}>UMP {wageYear} pekerja formal</th>
```

On the scroll container, change `focus-visible:outline-leaf-deep` to `focus-visible:outline-ring`.

- [ ] **Step 7: CommoditySelect**

Set the imports to `import { ChevronBadge, Listbox, ListboxEmpty, ListboxGroup, ListboxOption, ListboxSearch, fieldMenuClass, fieldTriggerClass } from "@monitor-pangan/ui"`. Remove `Input`, and remove `cn` if it is now unused.

Add above `return (`:

```tsx
  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery("")
  }
```

Replace everything inside `<div className={fieldMenuClass()}>…</div>` with:

```tsx
          <ListboxSearch
            ref={searchRef}
            label="Cari komoditas"
            value={query}
            onValueChange={setQuery}
            placeholder="Cari komoditas…"
          />
          <Listbox id={listId} label="Komoditas">
            {allowEmpty ? (
              <ListboxOption selected={value === ""} onSelect={() => pick("")}>
                Semua komoditas
              </ListboxOption>
            ) : null}
            {matchCount === 0 ? <ListboxEmpty>Tidak ada komoditas yang cocok.</ListboxEmpty> : null}
            {groups.map(([group, items]) => (
              <ListboxGroup key={group} label={group}>
                {items.map((c) => (
                  <ListboxOption key={c.id} selected={c.id === value} onSelect={() => pick(c.id)} trailing={hintFor?.(c)}>
                    {c.name}
                  </ListboxOption>
                ))}
              </ListboxGroup>
            ))}
          </Listbox>
```

- [ ] **Step 8: PlaceSelect**

Set the ui import to `import { Button, ChevronBadge, Listbox, ListboxEmpty, ListboxOption, ListboxSearch, fieldMenuClass, fieldTriggerClass } from "@monitor-pangan/ui"`, and drop `Input`.

Replace the menu body inside `<div className={fieldMenuClass()}>…</div>` with:

```tsx
            <ListboxSearch
              ref={searchRef}
              label="Cari kota atau kabupaten"
              value={query}
              onValueChange={setQuery}
              placeholder="Cari kota atau kabupaten…"
            />
            <Listbox id={listId} label="Kota atau kabupaten">
              {matches.length === 0 ? <ListboxEmpty>Tidak ada tempat yang cocok.</ListboxEmpty> : null}
              {matches.map((place) => (
                <ListboxOption
                  key={place.code}
                  selected={place.code === value}
                  onSelect={() => {
                    onChange(place.code)
                    setOpen(false)
                    setQuery("")
                  }}
                >
                  {place.name}
                </ListboxOption>
              ))}
            </Listbox>
```

Delete the `PlaceOption` function. On the "Gunakan lokasi saat ini" button, change `className="self-start disabled:cursor-not-allowed disabled:opacity-40"` to `className="self-start"`. Remove `cn` from the imports if it is now unused.

- [ ] **Step 9: Verify**

Run: `rg -n 'type="search"|role="option"|<dt |ember-soft|directionMark|directionClass' src`
Expected: only `src/components/daya-beli-tier.ts` (`bg-ember-soft` worst-tier chip) and `src/components/DayaBeliSummary.tsx:49` (warning banner). Both are data meaning.

Run: `pnpm typecheck && pnpm test src/lib/format.test.ts src/lib/daya-beli.test.ts`

Browser at 1280 and 390:
- `/`: PriceTable header, search and sort match DayaBeliTable on `/daya-beli`, both in look and in mobile stacking.
- Selected rows are grey with an ink bar.
- Commodity and place menus look identical.

- [ ] **Step 10: Commit**

```bash
git add src/components
git commit -m "refactor: build tables, lists, stats and menus from shared ui components" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.5: One select implementation (#23)

**Files:**
- Modify: `src/components/AdminDesk.tsx:296-302`, `src/routes/tren.tsx` (~123–135), `src/components/DatePicker.tsx` (98–157)

PriceTable's sort select is already a `FieldSelect` after Task 2.4.

- [ ] **Step 1: AdminDesk evidence select**

Replace the `<label className="flex flex-col gap-1 text-sm"><span className="text-slate">Bukti</span><Select …>…</Select></label>` block with:

```tsx
<FieldSelect label="Bukti" value={evidence} onChange={(event) => setEvidence(evidenceOf(event.target.value))}>
  <option value="receipt">Struk</option>
  <option value="board">Papan harga</option>
  <option value="none">Tanpa bukti</option>
</FieldSelect>
```

In the ui import, replace `Select` with `FieldSelect`.

- [ ] **Step 2: tren Provinsi gets a visible label**

Replace the `<div className="relative flex items-center"> <Select … aria-label="Provinsi" …> … </div>` block with:

```tsx
<FieldSelect
  label="Provinsi"
  value={regionCode ?? ""}
  onChange={(e) => setRegionCode(e.target.value === "" ? null : e.target.value)}
  wrapperClassName="min-w-48"
>
  <option value="">Nasional</option>
  {provinces.map((p) => (
    <option key={p.code} value={p.code}>
      {p.name}
    </option>
  ))}
</FieldSelect>
```

Drop `Select` and `ChevronBadge` from the tren imports if they're now unused.

- [ ] **Step 3: DatePicker: flatten the card group and use FieldSelect**

In `DatePicker.tsx`:
- Remove `cardClass("none", …)` from the `role="group"` div, so its className is `"flex shrink-0 items-center gap-2"`.
- Remove `disabled:cursor-not-allowed disabled:opacity-40` from both chevron buttons, because the base now has it.
- Change the date `<label>` wrapper from `className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg bg-paper px-1"` to `className={inputClass("flex shrink-0 cursor-pointer items-center px-1")}`. Leave the inner `<input type="date">` unchanged.
- Replace the `<div className="relative flex shrink-0 items-center"> <Select …> … <ChevronBadge/> </div>` block with:

```tsx
<FieldSelect
  label="Pilih tanggal perdagangan"
  hideLabel
  value={value}
  onChange={(e) => onChange(e.target.value)}
  wrapperClassName="w-40 shrink-0"
  className="tabular-nums"
>
  {groups.map((g) => (
    <optgroup key={g.label} label={g.label}>
      {g.dates.map((d) => (
        <option key={d} value={d}>
          {formatDateShort(d)}
        </option>
      ))}
    </optgroup>
  ))}
</FieldSelect>
```

Set the imports to `import { Button, FieldSelect, inputClass } from "@monitor-pangan/ui"`. Drop the `ChevronBadge` import, which Task 1.4 repointed. Keep `import { cn } from "#/lib/utils.ts"` only if `cn` is still used, because `noUnusedLocals` fails the typecheck otherwise.

- [ ] **Step 4: Verify**

Run: `rg -n "appearance-none|<Select" src`
Expected: no output. The only `Select` usage left is inside `packages/ui/src/field.tsx`.

Run: `pnpm typecheck`

Browser at 1280 on `/` and `/tren`: every control in the sticky toolbar measures 44px with a 10px radius, and the DatePicker group no longer measures 54px.

- [ ] **Step 5: Commit**

```bash
git add src/components/AdminDesk.tsx src/routes/tren.tsx src/components/DatePicker.tsx
git commit -m "fix: route every select through FieldSelect, label tren Provinsi, flatten DatePicker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.6: Toggles become SegmentedControl (#24)

**Files:**
- Modify: `src/routes/tren.tsx` (timeframe), `src/components/DayaBeliTable.tsx` (sort), `src/components/daya-beli-tier.ts` (drop `sortActiveClass`), `src/routes/laporan.tsx` (outlet), `src/components/AdminDesk.tsx` (view)

- [ ] **Step 1: tren timeframe**

Replace the `TIMEFRAMES.map(… <Button variant="rect" …/>)` inside `role="group" aria-label="Rentang waktu"` with:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <SegmentedControl
    label="Rentang waktu"
    options={TIMEFRAMES.map((t) => ({ value: t.id, label: t.label }))}
    value={timeframe}
    onChange={setTimeframe}
  />
  {dataSpan !== "" ? (
    <span className="tabular-nums text-xs text-slate" aria-label="Rentang data tersedia">
      Data: {dataSpan}
    </span>
  ) : null}
</div>
```

If `TIMEFRAMES[number]["id"]` is not a string-literal union, type `options` with `as const` on `TIMEFRAMES`. Do not widen to `string`.

- [ ] **Step 2: Daya Beli sort**

Replace the `role="group" aria-label="Urutkan daya beli"` div and its two Buttons with:

```tsx
<SegmentedControl
  label="Urutkan daya beli"
  options={[
    { value: "amount-desc", label: "Daya beli tertinggi" },
    { value: "amount-asc", label: "Daya beli terendah" },
  ] as const}
  value={sort === "amount-asc" ? "amount-asc" : "amount-desc"}
  onChange={setSort}
  className="grid grid-cols-2 lg:flex"
  itemClassName="w-full lg:w-auto"
/>
```

Delete `sortActiveClass` from `daya-beli-tier.ts`, and remove its import from `DayaBeliTable.tsx`.

- [ ] **Step 3: Laporan outlet and Admin view**

In `src/routes/laporan.tsx`, replace the two outlet Buttons with:

```tsx
<SegmentedControl
  label="Jenis tempat"
  options={[
    { value: "pasar", label: outletLabel("pasar") },
    { value: "ritel", label: outletLabel("ritel") },
  ] as const}
  value={outlet}
  onChange={(next) =>
    void navigate({ search: (prev) => ({ ...prev, outlet: next === "ritel" ? "ritel" : undefined }) })
  }
/>
```

In `src/components/AdminDesk.tsx`, replace the Menunggu/Ditinjau Buttons with:

```tsx
<SegmentedControl
  label="Tampilan"
  options={[
    { value: "pending", label: "Menunggu" },
    { value: "reviewed", label: "Ditinjau" },
  ] as const}
  value={view}
  onChange={(next) => {
    setView(next)
    if (next === "reviewed") loadReviewed(null)
  }}
/>
```

- [ ] **Step 4: Verify**

Run: `rg -n "sortActiveClass|active=\{" src`
Expected: no output.

Run: `pnpm typecheck && pnpm test src/lib/daya-beli.test.ts`

Browser: on `/daya-beli`, the active sort is ink-filled for both options.

- [ ] **Step 5: Commit**

```bash
git add src/routes/tren.tsx src/components/DayaBeliTable.tsx src/components/daya-beli-tier.ts src/routes/laporan.tsx src/components/AdminDesk.tsx
git commit -m "fix: render every one-of-N toggle through SegmentedControl" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.7: Primary button, FileInput and form width (#25, #23)

**Files:**
- Modify: `src/components/LaporForm.tsx` (132–190), `src/components/LaporanList.tsx:37`, `src/components/AdminDesk.tsx` (approve button)

- [ ] **Step 1: LaporForm**

Replace the photo `<label>…<Input type="file" …/></label>` block with:

```tsx
<FileInput label="Foto, boleh kosong" accept="image/*" onFile={setFile} />
```

Change the submit button to:

```tsx
<Button type="submit" variant="primary" disabled={pending || token.length === 0}>
  Kirim laporan
</Button>
```

Change the `<form>` className to `"flex w-full max-w-xl flex-col gap-4"`. Remove `className="min-h-11"` from the alias Input, because the base now has it. Add `FileInput` to the ui import.

- [ ] **Step 2: Laporan CTA and admin approve**

In `LaporanList.tsx:37`, change `className={buttonClass("pill")}` to `className={buttonClass("primary", false, "inline-flex items-center")}`.

In `AdminDesk.tsx`, give the "Terima" approve button `variant="primary"`. The reject action stays the default style. One primary per card.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`

Browser on `/lapor` at 1280: the form is ≤ 576px wide. The submit button is green. While disabled, its computed `opacity` is `0.5`. The file control is 44px tall.

- [ ] **Step 4: Commit**

```bash
git add src/components/LaporForm.tsx src/components/LaporanList.tsx src/components/AdminDesk.tsx
git commit -m "fix(lapor): primary submit and CTA, styled file picker, bounded form width" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.8: Page shell, headers, toolbar z and heading scale (#27)

**Files:**
- Modify: `src/routes/index.tsx:78-79`, `tren.tsx:108-109`, `daya-beli.tsx:119-120`, `lapor.tsx:17-24`, `laporan.tsx:158-162`, `admin.tsx:22-24,47`
- Modify: `src/components/LaporanList.tsx:31-39`, `AdminDesk.tsx:111,146`, `ProvincePanel.tsx`

PriceTable, DayaBeliTable, MoversList and ChartHighlights headings already moved to `Panel` and `eyebrowClass` in Task 2.4.

- [ ] **Step 1: Routes**

For every route (`index`, `tren`, `daya-beli`, `lapor`, `laporan`, `admin`):
- Replace `<main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-…">…</main>` with `<PageShell>…</PageShell>`. The `/admin` sign-in uses `<PageShell className="max-w-md">`. The `__root.tsx:63` error page keeps its own centered `<main>`.
- Replace the two-level toolbar `<div className="sticky top-0 z-… backdrop-blur"><div className="flex flex-wrap items-end gap-2">…</div></div>` with `<StickyToolbar>…</StickyToolbar>`. If a route has only the outer div, wrap its children the same way. On daya-beli use `<StickyToolbar className="py-3">`.
- Import `PageHeader, PageShell, StickyToolbar` from `@monitor-pangan/ui`.

Add page headers, placed directly inside `<main>` before the toolbar:

```tsx
// index.tsx
<PageHeader title="Peta harga pangan" visuallyHidden />
// tren.tsx
<PageHeader title="Grafik tren harga" visuallyHidden />
// daya-beli.tsx
<PageHeader title="Daya beli pangan" visuallyHidden />
// lapor.tsx — replaces the existing <header>
<PageHeader title="Lapor harga" description="Satu harga yang Anda lihat. Laporan menunggu tinjauan dan bukan data PIHPS." />
// laporan.tsx — replaces the existing <header>
<PageHeader title="Laporan Warga" description="Harga yang dilaporkan warga. Bukan data PIHPS." />
// admin.tsx:47 main (signed-in desk) — first child
<PageHeader title="Tinjauan laporan" />
// admin.tsx:22 sign-in: leave the <h2> inside the Card as is (already text-lg); only the <main> class changes
```

- [ ] **Step 2: Section headings**

- `LaporanList.tsx`: `<h2 className="text-lg font-bold">Laporan yang ditinjau</h2>` becomes a `SectionHeader`. Keep `id="ditinjau-arti"` on the description by passing `description={<span id="ditinjau-arti">{DITINJAU_COPY}</span>}`.
- `AdminDesk.tsx:111`: `{view === "pending" ? <h2 className="text-lg font-bold">Menunggu</h2> : null}` becomes `{view === "pending" ? <SectionHeader title="Menunggu" /> : null}`. At `AdminDesk.tsx:146`, `<h2 className="text-lg font-bold">Ditinjau</h2>` becomes `<SectionHeader title="Ditinjau" />`.
- `ProvincePanel.tsx`:
  - `text-xl` becomes `text-lg` on both h2s.
  - Remove `justify-center` from both `cardClass("lg", "flex flex-col justify-center")`, so empty states top-align.
  - The percent `diff.toFixed(1)` line is handled in Task 3.1.

- [ ] **Step 3: Verify**

Run: `rg -n "text-xl|z-10 |z-30 |py-6|<main " src/routes src/components`
Expected: exactly five hits, all intentional:
- `__root.tsx:41` (h1 `text-xl`)
- `__root.tsx:63` (error page `<main>`)
- `DayaBeliTable.tsx:153` (`th z-30`)
- `DayaBeliTable.tsx:187` (`td z-10`)
- `DayaBeliSummary.tsx:75` (unit `text-xl`)

The two DayaBeliTable hits are sticky cells inside the table. They stay below `--z-toolbar: 40`.

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/routes src/components
git commit -m "fix: shared page shell, page and section headers, one toolbar z-index" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2.9: StatusMessage adoption (#30)

**Files:**
- Modify: `src/routes/laporan.tsx:195-200`, `src/components/LaporanList.tsx` (windowEmpty card), `src/components/DayaBeliTable.tsx` (no-match `<p>`), `src/components/AdminDesk.tsx:112,113,147` (error and empty lists), `src/components/ProvincePanel.tsx:47-60` (no-data branch)

MoversList and ChartSummaryStrip empty states already use `StatusMessage` after Task 2.4.

- [ ] **Step 1: Replace each ad-hoc state**

```tsx
// laporan.tsx
{loadError ? (
  <StatusMessage tone="error" title="Daftar laporan tidak bisa dimuat.">
    Coba muat ulang halaman sebentar lagi.
  </StatusMessage>
) : windowEmpty ? (
  <StatusMessage tone="empty" title={EMPTY_WINDOW_COPY}>{NO_PIN_COPY}</StatusMessage>
) : (
  <p className="text-sm text-slate">{NO_PIN_COPY}</p>
)}

// LaporanList.tsx windowEmpty
{windowEmpty ? <StatusMessage tone="empty" title={EMPTY_WINDOW_COPY} /> : null}

// DayaBeliTable.tsx no match
<StatusMessage tone="empty" title="Tidak ada provinsi yang cocok dengan pencarian." bare />

// AdminDesk.tsx error
{error != null ? <StatusMessage tone="error" title={error} /> : null}

// AdminDesk.tsx empty pending list
{view === "pending" && items != null && items.length === 0 ? <StatusMessage tone="empty" title={ADMIN_EMPTY_COPY} /> : null}

// AdminDesk.tsx reviewed list empty (line ~147)
{rows.length === 0 ? <StatusMessage tone="empty" title="Belum ada laporan yang ditinjau." /> : null}

// ProvincePanel.tsx no-data branch (lines 47-60); `justify-center` is already gone after Task 2.8
<aside className={cardClass("lg", "flex flex-col")}>
  <p className="text-sm text-slate">
    {commodityName} · {formatDateShort(date)}
  </p>
  <h2 className="text-lg font-bold">{provinceName}</h2>
  <StatusMessage tone="empty" title="Tidak ada data" bare className="mt-3 px-0 py-0">
    Provinsi ini tidak disurvei PIHPS pada tanggal ini, atau sumbernya kosong.
  </StatusMessage>
  {/* keep the existing tabular {range} paragraph here unchanged */}
</aside>
```

`className` is the Task 1.7 prop. It merges last through `cn`, so `px-0 py-0` drops the bare padding inside the already padded aside.

- [ ] **Step 2: Gates for PR 2**

Run: `pnpm typecheck && pnpm test src/ui-guard.test.ts src/data/provider.test.ts src/lib/province-fill.test.ts src/lib/chart-marks.test.ts src/lib/daya-beli.test.ts && pnpm build`
Expected: all green. `src/ui-guard.test.ts` from Task 2.0 now passes.

Browser pass at 1280 and 390 on `/`, `/tren`, `/daya-beli`, `/lapor` and `/laporan`:
- Tab through each toolbar. Every control shows the ink ring.
- Re-run the computed-style script from Task 1.4 Step 3. Every control reports 44px, 10px radius and `rgb(228, 230, 223)`.

- [ ] **Step 3: Commit, push and open the PR**

```bash
git add src
git commit -m "fix: route empty and error states through StatusMessage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin ui/phase-2-adoption
gh pr create --base main --title "UI phase 2: adopt shared components across routes" --body "Part of #31. Closes #22 #24 #25 #26 #27. Advances #23 and #30.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
# then register the PR URL in T3 Code with link_pull_request
```

---

# PR 3 — Copy and number format (#28)

Branch: `ui/phase-3-copy-format`

### Task 3.1: id-ID percent format

The glyphs and the "Perubahan" / "urut dari perubahan terbesar" copy already shipped in Task 2.4 through `Delta`. This task fixes the number format, which every `Delta` shows.

**Files:**
- Modify: `src/lib/format.ts:110-115`
- Test: `src/lib/format.test.ts`
- Modify: `src/components/ProvincePanel.tsx:76-79`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format.test.ts`, and add `formatPct` to its import:

```ts
it.effect("formats percent deltas in id-ID with a comma decimal", () =>
  Effect.sync(() => {
    assert.strictEqual(formatPct(44.7), "+44,7%")
    assert.strictEqual(formatPct(-4.43), "-4,4%")
    assert.strictEqual(formatPct(108.25), "+108,3%")
    assert.strictEqual(formatPct(0), "0,0%")
    assert.strictEqual(formatPct(0.04), "0,0%")
    assert.strictEqual(formatPct(-0.04), "0,0%")
    assert.strictEqual(formatPct(1234.5), "+1.234,5%")
  }),
)
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/lib/format.test.ts`
Expected: FAIL. `formatPct(44.7)` returns `"+44.7%"`.

- [ ] **Step 3: Implement in `src/lib/format.ts`**

Replace `formatPct`:

```ts
const PCT = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Format a percent delta in id-ID: "+1,2%", "-0,8%", or "0,0%". */
export function formatPct(value: number): string {
  if (Number(value.toFixed(1)) === 0) return "0,0%"
  const sign = value > 0 ? "+" : "-"
  return `${sign}${PCT.format(Math.abs(value))}%`
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: ProvincePanel badge**

In `ProvincePanel.tsx:76-79`, change the badge content from `{above ? "+" : ""}{diff.toFixed(1)}% vs nasional` to `{formatPct(diff)} vs nasional`. Add `formatPct` to its `#/lib/format.ts` import.

- [ ] **Step 6: Verify**

Run: `rg -n "toFixed\(1\)\}?%|↑|↓|Δ range|sorted by" src/components src/routes`
Expected: no output. (`TrendChart.tsx` keeps `toFixed(1)` for SVG path coordinates, which the `%` in the pattern excludes.)

Run: `pnpm typecheck && pnpm test src/lib/format.test.ts && pnpm build`

- [ ] **Step 7: Commit, push and open the PR**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/components/ProvincePanel.tsx
git commit -m "fix: format percent deltas in id-ID" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin ui/phase-3-copy-format
gh pr create --base main --title "UI phase 3: copy and number format" --body "Part of #31. Closes #28.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
# then register the PR URL in T3 Code with link_pull_request
```

---

# PR 4 — Mobile 390px (#29)

Branch: `ui/phase-4-mobile`

### Task 4.1: Verify 390px layout of the data blocks

`Panel` (Task 1.9) stacks the toolbar below `sm`, and `tdClass("end")` (Task 1.12) sets `whitespace-nowrap`. PriceTable and DayaBeliTable got both in Task 2.4, so this task only measures. Fix any overflow in the shared component, not in the call site.

- [ ] **Step 1: Browser check at 390 on `/`, `/tren` and `/daya-beli`**

```js
const w = document.documentElement.clientWidth; [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > w + 1 && !el.closest('.overflow-auto')).map(el => el.tagName + '.' + el.className.toString().slice(0, 40))
```

Expected: `[]`. Tables scroll inside their own `overflow-auto` and no price cell wraps.

- [ ] **Step 2: Only if Step 1 found overflow, fix it in `packages/ui` and commit**

```bash
git add packages/ui/src
git commit -m "fix(ui): keep shared panels inside a 390px viewport" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4.2: Readable chart tick labels at narrow widths

**Files:**
- Modify: `src/lib/chart-marks.ts` (`axisInset`, plus a new `axisFontScale`)
- Test: `src/lib/chart-marks.test.ts`
- Modify: `src/components/TrendChart.tsx` (lines ~94–160, 286–410)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/chart-marks.test.ts`, and add `axisFontScale` to its import:

```ts
it.effect("scales axis text so it renders at least at its base px size", () =>
  Effect.sync(() => {
    assert.strictEqual(axisFontScale(720, 720), 1)
    assert.strictEqual(axisFontScale(720, 1080), 1)
    assert.strictEqual(axisFontScale(720, 360), 2)
    assert.strictEqual(axisFontScale(720, 200), 2.5)
    assert.strictEqual(axisFontScale(720, 0), 1)
  }),
)

it.effect("widens the left inset with the font scale", () =>
  Effect.sync(() => {
    assert.isTrue(axisInset(["16.770"], 2) > axisInset(["16.770"], 1))
    assert.strictEqual(axisInset(["16.770"]), axisInset(["16.770"], 1))
  }),
)
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/lib/chart-marks.test.ts`
Expected: FAIL, `axisFontScale` is not exported.

- [ ] **Step 3: Implement in `chart-marks.ts`**

```ts
/** Factor for SVG text so it renders at ≥ its base px when the viewBox is scaled down. Capped at 2.5. */
export function axisFontScale(viewWidth: number, renderedWidth: number): number {
  if (renderedWidth <= 0 || renderedWidth >= viewWidth) return 1
  return Math.min(viewWidth / renderedWidth, 2.5)
}

export function axisInset(labels: readonly string[], fontScale = 1): number {
  const widest = labels.reduce((max, label) => Math.max(max, label.length), 0)
  return widest * 7 * fontScale + 16
}
```

- [ ] **Step 4: Use it in TrendChart**

Change the React import to `import { useEffect, useRef, useState } from "react"`. After `const svgRef = …`, add:

```tsx
const [renderedWidth, setRenderedWidth] = useState(CHART_WIDTH)
useEffect(() => {
  const svg = svgRef.current
  if (svg == null) return
  const observer = new ResizeObserver(([entry]) => {
    if (entry != null) setRenderedWidth(entry.contentRect.width)
  })
  observer.observe(svg)
  return () => observer.disconnect()
}, [])
const fontScale = axisFontScale(CHART_WIDTH, renderedWidth)
```

Then:
- `axisInset(ticks.map(…))` becomes `axisInset(ticks.map(…), fontScale)`.
- On every axis `<text>`, `fontSize={11}` becomes `fontSize={11 * fontScale}`. The two `fontSize={12}` labels become `fontSize={12 * fontScale}`.
- The x-axis label `y={viewHeight - 8}` becomes `y={viewHeight - 8 * fontScale}`. If labels clip at the bottom, add `8 * (fontScale - 1)` to the bottom padding constant.
- Import `axisFontScale` alongside `axisInset`.

- [ ] **Step 5: Verify**

Run: `pnpm test src/lib/chart-marks.test.ts && pnpm typecheck`

Browser `/tren` at 390: `[...document.querySelectorAll('figure svg text')].map(t => t.getBoundingClientRect().height|0)`
Expected: every value is ≥ 11. At 1280, the chart is unchanged (scale 1).

- [ ] **Step 6: Gates, commit and PR**

Run: `pnpm build`

```bash
git add src/lib/chart-marks.ts src/lib/chart-marks.test.ts src/components/TrendChart.tsx
git commit -m "fix(mobile): keep chart axis labels readable when the svg scales down" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin ui/phase-4-mobile
gh pr create --base main --title "UI phase 4: mobile 390px fixes" --body "Part of #31. Closes #29.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
# then register the PR URL in T3 Code with link_pull_request
```

---

# PR 5 — Docs and the data-backed audit (#23, #30, #31)

Branch: `ui/phase-5-data-audit`

### Task 5.1: Record the rules

**Files:**
- Modify: `AGENTS.md` (Frontend UI system section)
- Modify: `docs/superpowers/specs/2026-09-16-monitor-pangan-ui-mvp.md` (append a section)

- [ ] **Step 1: AGENTS.md**

Under "Frontend UI system", after the `primitives.tsx` bullet, add:

```markdown
- `packages/ui/src/field.tsx` owns `FieldSelect`, `FileInput`, `ChevronBadge`, `fieldTriggerClass`, `fieldMenuClass`. No hand-rolled `appearance-none` selects in the app.
- `packages/ui/src/segmented.tsx` owns `SegmentedControl` for every one-of-N toggle. Two options: segmented. Three or more: `FieldSelect`.
- `packages/ui/src/layout.tsx` owns `PageShell`, `StickyToolbar`, `PageHeader`, `SectionHeader`, `navPillClass`, `eyebrowClass`, `selectedRowClass` (plus the `pageShellClass` / `stickyToolbarClass` strings).
- `packages/ui/src/status.tsx` owns `StatusMessage` for every empty, error and loading state.
- `packages/ui/src/delta.tsx` owns `Delta` for every price or percent change (`▲` ember, `▼` leaf-deep, `•` slate).
- `packages/ui/src/panel.tsx` owns `Panel`, the card with a title bar and toolbar. `packages/ui/src/stat.tsx` owns `StatList` + `Stat`.
- `packages/ui/src/listbox.tsx` owns `SearchInput` and the `Listbox*` pieces for searchable pickers. `packages/ui/src/table.ts` owns `tableClass`, `thClass`, `tdClass`.
- `src/ui-guard.test.ts` fails when app code hand-rolls a select, search box, option row, stat, hex color, `<main>` or sticky toolbar. Extend the shared component instead of allowlisting.
- `packages/ui/src/tokens.ts` mirrors color tokens for SVG/Leaflet. Never hardcode hex in `src/`.
- Ember, leaf, gold and heat are data colors. Selection uses `selectedRowClass`, active toggles use ink, primary actions use `buttonClass("primary")`.

Before building UI, pick the component from this table:

| Need | Use (from `@monitor-pangan/ui`) |
|---|---|
| Pick one of 3+ values | `FieldSelect` |
| Pick one of 2 values | `SegmentedControl` |
| Searchable picker | `ListboxSearch`, `Listbox`, `ListboxGroup`, `ListboxOption`, `ListboxEmpty` |
| Filter a list or table | `SearchInput` |
| File upload | `FileInput` |
| Price or percent change | `Delta` (or `directionGlyph` / `directionTextClass` in SVG) |
| Card with a title bar and controls | `Panel` |
| Label and value figures | `StatList` + `Stat` |
| Data table | `tableClass`, `thClass`, `tdClass` |
| Selected row or option | `selectedRowClass` |
| Page wrapper and its toolbar | `PageShell`, `StickyToolbar` |
| Page and section titles | `PageHeader`, `SectionHeader`, `eyebrowClass` |
| Nav link | `navPillClass` |
| Empty, error, loading | `StatusMessage` |
| Color in SVG or Leaflet | `color` from `tokens.ts` |
```

- [ ] **Step 2: UI MVP spec**

Append a `## UI rules (2026-10-16 audit)` section. It copies the "Decisions locked by this plan" table and the "Need → component" table from this plan, plus a link to #31. Plans are working documents, so the spec must hold both tables.

- [ ] **Step 3: Commit (docs only, no tests)**

```bash
git add AGENTS.md docs/superpowers/specs/2026-09-16-monitor-pangan-ui-mvp.md
git commit -m "docs: record UI consistency rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5.2: Audit laporan and admin with real data

- [ ] **Step 1: Run the worker locally with seeded data**

```bash
pnpm run db:setup
pnpm build
npx wrangler dev --port 8787
```

Expected: `/api/laporan` returns 200 JSON. If seed.sql has no reviewed laporan rows, insert two through `/lapor` and approve them in `/admin`, using the local admin credentials from `wrangler.toml` / `.dev.vars`.

- [ ] **Step 2: Measure**

On http://localhost:8787 at 1280 and 390, check `/laporan` (list, map pins, place card, province panel), `/lapor` (success state) and `/admin` (pending and reviewed):
- Run the Task 1.4 computed-style script.
- Run the Task 4.1 overflow script.
- Tab through every control.
- Take screenshots.

- [ ] **Step 3: File or fix**

Fix any finding under 15 minutes in this PR. File anything larger as a new issue linked from #31.

- [ ] **Step 4: Gates, PR and close the tracker**

Run: `pnpm typecheck && pnpm build`

```bash
git push -u origin ui/phase-5-data-audit
gh pr create --base main --title "UI phase 5: docs and data-backed audit" --body "Part of #31. Closes #23 #30. Screenshots of laporan/admin with data attached.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
# then register the PR URL in T3 Code with link_pull_request
```

After this PR merges, tick every box in #31 and close it.

---

## Self-review

**Issue coverage:**

| Issue | Tasks |
|---|---|
| #22 | 2.1 |
| #23 | 1.1, 1.3, 1.4, 2.5, 2.7 (file input), 2.9 (verify) |
| #24 | 1.5, 2.6 |
| #25 | 1.3, 2.7 |
| #26 | 1.1, 1.2, 1.11, 2.2, 2.3, 2.4 |
| #27 | 1.6, 1.9, 1.10, 1.12, 2.4, 2.8 |
| #28 | 1.8 (`Delta`), 2.4 (copy and glyphs), 3.1 |
| #29 | 1.9 (Panel toolbar stacks), 1.12 (`tdClass` nowrap), 4.1, 4.2. Nav wrap is in 2.1. The tren Provinsi width is in 2.5. |
| #30 | 1.7, 2.9, 5.2 |
| Regression guard | 2.0 (`src/ui-guard.test.ts`) |
| #31 | 5.1, 5.2 |

**Type consistency:**
- `ButtonVariant` gains `"primary"` and is used in 1.3, 1.4 and 2.7.
- `FieldSelect` props are `label`, `hideLabel`, `wrapperClassName`, `className`, and are used identically in 2.5.
- `SegmentedControl<T>` takes `label`, `options`, `value`, `onChange`, `className`, `itemClassName` in 1.5 and 2.6.
- `axisInset(labels, fontScale = 1)` keeps old call sites valid.
- `dataBadgeTone(badge: string)` is defined in 2.2.
- `Direction` in `packages/ui/src/delta.tsx` is `"up" | "down" | "flat"`, structurally equal to `TrendDirection` in `src/data/provider.ts:27`, so app values pass straight in. `directionGlyph` lives in `@monitor-pangan/ui` (1.8), not in `format.ts`.
- `Panel` props `title`, `description`, `toolbar`, `headerExtra`, `busy`, `aria-label` (1.9) match PriceTable, MoversList and DayaBeliTable in 2.4.
- `Stat` props `label`, `value`, `hint`, `accent` (1.10) match ChartSummaryStrip and DayaBeliSummary in 2.4.
- `ListboxOption` props `selected`, `onSelect`, `trailing` (1.11) match CommoditySelect and PlaceSelect in 2.4.
- `thClass(align, className)` / `tdClass(align, className)` (1.12) match PriceTable and DayaBeliTable in 2.4.

**Known risk:**
- TanStack `Link` `activeProps`/`inactiveProps` merge with `className`, so 2.1 sets no base `className` on purpose.
- `z-(--z-toolbar)` is Tailwind 4 CSS-variable shorthand. If the build rejects it, use `z-[var(--z-toolbar)]`.
