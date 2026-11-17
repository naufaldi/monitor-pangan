import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { DecisionFeedbackMessage } from "./AdminDesk.tsx"
import { createDecisionController, DECISION_FAILURE_COPY, type DecisionFailureKind } from "./admin-decision.ts"

const render = (kind: DecisionFailureKind) =>
  renderToStaticMarkup(
    createElement(DecisionFeedbackMessage, { feedback: { id: "report-a", scope: "pending", kind }, onReload: () => {} }),
  )

it.effect("decision feedback renders an honest alert for every failure kind with a reconcile action only when unknown", () =>
  Effect.sync(() => {
    for (const kind of ["conflict", "missing", "unavailable", "unknown"] as const) {
      const html = render(kind)
      const copy = DECISION_FAILURE_COPY[kind]
      assert.include(html, 'role="alert"')
      assert.include(html, copy.title)
      assert.include(html, copy.body)
      assert.notInclude(html, "synthetic-secret")
      assert.notInclude(html, "Bearer")
      if (kind === "unknown") assert.include(html, "Muat ulang")
      else assert.notInclude(html, "Muat ulang")
    }
  }),
)
// Exercise the real client -> controller -> presentation boundary with synthetic responses.
// This is static rendering, not browser click or reload wiring proof.
it.effect("server and lost-response outcomes render reconciliation through the actual decision client", () =>
  Effect.gen(function* () {
    for (const status of [500, 503, 0]) {
      yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          const original = globalThis.fetch
          let posts = 0
          globalThis.fetch = () => {
            posts += 1
            return status === 0 ? Promise.reject(new Error("synthetic response loss")) : Promise.resolve(new Response(null, { status }))
          }
          return { original, posts: () => posts }
        }),
        ({ posts }) => Effect.gen(function* () {
          let reloads = 0
          const controller = createDecisionController()
          yield* controller.decide({
            secret: "synthetic-secret",
            scope: "pending",
            body: { id: "report-a", action: "approve", evidence: "none" },
            onReject: () => assert.fail("must not reject session"),
            reload: () => { reloads += 1 },
          })
          const feedback = controller.getSnapshot().feedback
          assert.isNotNull(feedback)
          const html = renderToStaticMarkup(createElement(DecisionFeedbackMessage, { feedback: feedback!, onReload: () => {} }))
          assert.include(html, "Hasil keputusan belum diketahui.")
          assert.include(html, "mungkin sudah tersimpan")
          assert.include(html, "sebelum mencoba lagi")
          assert.include(html, "Muat ulang")
          assert.notInclude(html, "Keputusan gagal diproses")
          assert.notInclude(html, "synthetic-secret")
          assert.strictEqual(posts(), 1)
          assert.strictEqual(reloads, 0)
        }),
        ({ original }) => Effect.sync(() => { globalThis.fetch = original }),
      )
    }
  }),
)
