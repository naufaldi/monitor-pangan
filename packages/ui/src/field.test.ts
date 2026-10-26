import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FieldInput } from "./field.tsx"

it.effect("connects a field label, unit hint and validation message without losing caller descriptions", () => Effect.sync(() => {
  const html = renderToStaticMarkup(createElement(FieldInput, { id: "quantity", label: "Jumlah Beras (kg)", hint: "kg", error: "Jumlah tidak valid", "aria-describedby": "help" }))
  assert.ok(html.includes('for="quantity"'))
  assert.ok(html.includes('aria-describedby="help quantity-hint quantity-error"'))
  assert.ok(html.includes('aria-invalid="true"'))
  assert.ok(html.includes('id="quantity-error"'))
}))
