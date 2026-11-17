import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { DecisionFeedbackMessage } from "./AdminDesk.tsx"
import { DECISION_FAILURE_COPY, type DecisionFailureKind } from "./admin-decision.ts"

const render = (kind: DecisionFailureKind) =>
  renderToStaticMarkup(
    createElement(DecisionFeedbackMessage, { feedback: { scope: "pending", kind }, onReload: () => {} }),
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