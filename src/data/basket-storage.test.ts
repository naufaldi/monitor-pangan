import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { BASKET_STORAGE_KEY, basketToSave, clearBasket, loadBasket, restoredQuantities, saveBasket, type BasketStorage } from "./basket-storage.ts"

const valid = { version: 1 as const, province: "31", date: "2026-09-16", comparisonDate: "2026-09-15", quantities: { beras: 250, "minyak-goreng": 50 } }
function memory() {
  const values = new Map<string, string>([["unrelated", "keep"]])
  const storage: BasketStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) } }
  return { values, storage }
}

it.effect("saves versioned inputs, restores exact decimal quantities and clears only its own key", () => Effect.gen(function* () {
  const { storage, values } = memory()
  assert.strictEqual(yield* loadBasket(storage), null)
  const basket = basketToSave("31", valid.date, valid.comparisonDate, { beras: "2,5", "minyak-goreng": "0.5" })
  assert.deepStrictEqual(basket, valid)
  assert.ok(basket != null)
  yield* saveBasket(storage, basket)
  const restored = yield* loadBasket(storage)
  assert.deepStrictEqual(restored, valid)
  assert.deepStrictEqual(restoredQuantities(restored!), { beras: "2.5", "minyak-goreng": "0.5" })
  assert.ok(!values.get(BASKET_STORAGE_KEY)?.includes("total"))
  yield* clearBasket(storage)
  assert.strictEqual(yield* loadBasket(storage), null)
  assert.strictEqual(values.get("unrelated"), "keep")
}))

it.effect("rejects corrupt, excessive, unknown and inconsistent saved values without silently replacing them", () => Effect.gen(function* () {
  const { storage, values } = memory()
  for (const raw of ["{", " ".repeat(4097), ...[
    { ...valid, version: 2 }, { ...valid, province: "invalid" }, { ...valid, date: "2026-02-30" },
    { ...valid, comparisonDate: valid.date }, { ...valid, quantities: { beras: -1 } },
    { ...valid, quantities: { beras: 1.5 } }, { ...valid, quantities: { beras: 100001 } },
    { ...valid, quantities: { beras: 0 } }, { ...valid, quantities: { beras: 100, unknown: 100 } },
    { ...valid, price: 999 }, { ...valid, quantities: { beras: "100" } },
  ].map((value) => JSON.stringify(value))]) {
    values.set(BASKET_STORAGE_KEY, raw)
    const result = yield* Effect.either(loadBasket(storage))
    assert.ok(result._tag === "Left")
    assert.strictEqual(result.left.kind, "invalid")
    assert.strictEqual(values.get(BASKET_STORAGE_KEY), raw)
  }
  assert.strictEqual(basketToSave("31", valid.date, null, { beras: "-1" }), null)
  assert.strictEqual(basketToSave("31", valid.date, null, { unknown: "1" }), null)
}))

it.effect("reports denied reads, writes and removals as storage failures", () => Effect.gen(function* () {
  const deny = () => { throw new Error("Storage denied") }
  const storage: BasketStorage = { getItem: deny, setItem: deny, removeItem: deny }
  for (const effect of [loadBasket(storage), saveBasket(storage, valid), clearBasket(storage)]) {
    const result = yield* Effect.either(effect)
    assert.ok(result._tag === "Left")
    assert.strictEqual(result.left.kind, "unavailable")
  }
}))
