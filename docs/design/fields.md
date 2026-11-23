# Fields and pickers

```text
What is the user entering?
├─ Text or number with a label, hint, or error → FieldInput
├─ Native list of options → FieldSelect
├─ Commodity with groups and search → CommoditySelect
├─ City or district with search → PlaceSelect
├─ Calendar date → DatePicker
├─ Attachment → FileInput
└─ Query that filters a visible list → SearchInput
```

## FieldInput and Input

Use [FieldInput](../../packages/ui/src/field.tsx) for labeled text and numbers. It connects the hint and error to the field and sets `aria-invalid` when there is an error. Use [Input](../../packages/ui/src/primitives.tsx) when the surrounding pattern already supplies the accessible name, as in [DatePicker.tsx](../../src/components/DatePicker.tsx). Both have a 44px minimum control height. Neither has a variant prop. `hideLabel` defaults to `false` and preserves the accessible label when enabled. Use `leading` for short fixed prefixes such as `Rp`.

```tsx
// Correct, excerpt from LaporForm.tsx
<FieldInput label={`Harga per ${unit}`} leading="Rp" inputMode="numeric" error={fieldErrors.price} />

// Incorrect: duplicates the prefix and invalid-state styles
<Input aria-label={`Harga per ${unit}`} className="border-ember pl-10" />
```

See [LaporForm.tsx](../../src/components/LaporForm.tsx) for labeled price entry and [keranjang.tsx](../../src/routes/keranjang.tsx) for quantity validation.

## FieldSelect and Select

Use `FieldSelect` for native option lists such as outlet type or province. Use `Select` as the base primitive when an existing shared wrapper supplies the label and affordance. Both have one appearance. `FieldSelect` defaults to a visible label. Pass `hideLabel` for a dense toolbar when the context already identifies the field. Use the searchable picker pattern below when users need to filter the options.

```tsx
// Correct, excerpt from LaporForm.tsx
<FieldSelect
  label="Jenis tempat"
  value={outlet}
  onChange={(event) => setOutlet(event.target.value === "ritel" ? "ritel" : "pasar")}
>
  <option value="pasar">Pasar</option>
  <option value="ritel">Ritel</option>
</FieldSelect>

// Incorrect: overrides the field shape and bypasses the labeled wrapper
<Select aria-label="Jenis tempat" className="rounded-full" />
```

See [LaporForm.tsx](../../src/components/LaporForm.tsx) for visible labels and [tren.tsx](../../src/routes/tren.tsx) for toolbar usage.

## SearchInput and the listbox pieces

Use `SearchInput` for an always-visible filter such as the [price table search](../../src/components/PriceTable.tsx). Use `ListboxSearch` inside a picker menu to get the shared search row. Both use `label` as the accessible name and take a controlled `value` and `onValueChange`. They have no variants.

```tsx
// Correct, excerpt from PriceTable.tsx
<SearchInput label="Cari provinsi" value={query} onValueChange={setQuery} />

// Incorrect: duplicates the search pattern and uses a placeholder as its only label
<Input type="search" placeholder="Cari provinsi…" />
```

Reuse [CommoditySelect](../../src/components/CommoditySelect.tsx) for commodities and [PlaceSelect](../../src/components/PlaceSelect.tsx) for cities or districts. Use native `FieldSelect` if searching adds no value. For a new searchable domain picker, follow an existing composition. The app picker owns query, selection, keyboard interaction, and focus. The [shared listbox pieces](../../packages/ui/src/listbox.tsx) provide presentation.

| Piece | Use |
| --- | --- |
| `fieldTriggerClass()` | Apply to the picker trigger, with `ChevronBadge flipped={open}` for the open state |
| `fieldMenuClass()` | Anchor the menu below the trigger |
| `ListboxSearch` | Filter options from inside the menu |
| `Listbox` | Hold the labeled option list |
| `ListboxGroup` | Group related options under a heading, as in the commodity picker |
| `ListboxOption` | Set `selected` and `onSelect`. Use `trailing` for a secondary value, such as a price |
| `ListboxEmpty` | Show the no-match message inside the list |

The pieces have no variants. Option selection is a boolean state. The correct example is from [CommoditySelect.tsx](../../src/components/CommoditySelect.tsx).

```tsx
// Correct
<ListboxOption selected={value === ""} onSelect={() => pick("")}>Semua komoditas</ListboxOption>

// Incorrect: adds a visual variant for a selected state
<ListboxOption selected={true} onSelect={() => pick("")} variant="highlight">Semua komoditas</ListboxOption>
```

## FileInput

Use `FileInput` for an attachment. Use `FieldInput` for text entry. The picker has one appearance and keeps the native input focusable. Pass `selectedFileName` when the parent owns the attachment across form states. Pass `null` for no attachment, or omit the prop for local filename state. Handle both a file and `null` in `onFile` so removal clears the parent state.

The correct example is from [LaporForm.tsx](../../src/components/LaporForm.tsx).

```tsx
// Correct
<FileInput label="Foto, boleh kosong" accept="image/*" selectedFileName={file?.name ?? null} onFile={setFile} />

// Incorrect: bypasses the filename and removal UI
<Input type="file" aria-label="Foto, boleh kosong" />
```
