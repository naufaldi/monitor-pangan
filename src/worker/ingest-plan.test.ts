import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { classifySuccessfulDay, planIngestDate } from "./ingest-plan.ts"

it.effect("rechecks current empty data but finalizes older empty survey days", () => Effect.sync(() => {
  assert.strictEqual(classifySuccessfulDay("2026-10-19", "2026-10-19", 0), "pending")
  assert.strictEqual(classifySuccessfulDay("2026-10-16", "2026-10-19", 0), "empty")
  assert.strictEqual(classifySuccessfulDay("2026-10-19", "2026-10-19", 10), "live")
}))
it.effect("earlier unresolved weekdays survive later observations", () => Effect.sync(() => {
  assert.strictEqual(planIngestDate("2026-10-19", "2026-10-15", [{ date: "2026-10-19", status: "live" }]), "2026-10-16")
  for (const status of ["pending", "error"] as const) {
    assert.strictEqual(planIngestDate("2026-10-19", "2026-10-15", [{ date: "2026-10-16", status: "live" }, { date: "2026-10-19", status }]), "2026-10-19")
  }
}))
it.effect("resolves confirmed empties, refreshes today and skips caught-up weekends", () => Effect.sync(() => {
  const days = [{ date: "2026-10-16", status: "empty" as const }]
  assert.strictEqual(planIngestDate("2026-10-17", "2026-10-15", days), null)
  assert.strictEqual(planIngestDate("2026-10-18", "2026-10-15", days), null)
  assert.strictEqual(planIngestDate("2026-10-19", "2026-10-15", [...days, { date: "2026-10-19", status: "live" }]), "2026-10-19")
  assert.strictEqual(planIngestDate("2026-10-16", "2026-10-16", []), null)
}))
