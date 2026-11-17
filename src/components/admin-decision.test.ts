import { assert, it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { LaporanClientError } from "#/data/laporan-client.ts"
import type { DecideBody } from "#/data/laporan.ts"
import {
  createDecisionController,
  decisionFailureKind,
  DECISION_FAILURE_COPY,
  type DecisionPost,
  type DecideRequest,
} from "./admin-decision.ts"

const approve = (id: string): DecideBody => ({ id, action: "approve", evidence: "none" })
const reject = (id: string): DecideBody => ({ id, action: "reject", note: "catatan uji sintetis" })

function makeReq(overrides: Partial<DecideRequest> = {}) {
  const calls = { reject: 0, reload: 0 }
  const req: DecideRequest = {
    secret: "synthetic-secret",
    scope: "pending",
    body: approve("report-a"),
    onReject: () => {
      calls.reject += 1
    },
    reload: () => {
      calls.reload += 1
    },
    ...overrides,
  }
  return { req, calls }
}

/** A post whose settlement the test controls, recording each request body. */
function controlledPost() {
  const calls: DecideBody[] = []
  const deferreds: Deferred.Deferred<void, LaporanClientError>[] = []
  const post: DecisionPost = (_secret, body) =>
    Effect.gen(function* () {
      calls.push(body)
      const deferred = yield* Deferred.make<void, LaporanClientError>()
      deferreds.push(deferred)
      return yield* Deferred.await(deferred)
    })
  return { post, calls, deferreds }
}

const failingPost = (status: number): DecisionPost => () => Effect.fail(new LaporanClientError({ status }))

it.effect("in-flight guard blocks competing decisions on one report, allows another, and recovers on settlement", () =>
  Effect.gen(function* () {
    const { post, calls, deferreds } = controlledPost()
    const controller = createDecisionController(post)

    const a = makeReq({ body: approve("report-a") })
    const fiberA = yield* Effect.fork(controller.decide(a.req))
    yield* Effect.yieldNow()
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(controller.getSnapshot().inflight["report-a"], "approve")

    // A competing rejection on the same report is refused without a second request.
    const competing = makeReq({ body: reject("report-a") })
    assert.strictEqual(yield* controller.decide(competing.req), false)
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(competing.calls.reload, 0)
    assert.strictEqual(controller.getSnapshot().inflight["report-a"], "approve")

    // A different report stays independent.
    const b = makeReq({ body: approve("report-b") })
    const fiberB = yield* Effect.fork(controller.decide(b.req))
    yield* Effect.yieldNow()
    assert.strictEqual(calls.length, 2)
    assert.strictEqual(controller.getSnapshot().inflight["report-b"], "approve")

    yield* Deferred.succeed(deferreds[0]!, undefined)
    assert.strictEqual(yield* Fiber.join(fiberA), true)
    assert.strictEqual(a.calls.reload, 1)
    assert.strictEqual(controller.getSnapshot().inflight["report-a"], undefined)

    // Report A's controls recovered: a fresh decision is accepted again.
    const again = makeReq({ body: approve("report-a") })
    const fiberAgain = yield* Effect.fork(controller.decide(again.req))
    yield* Effect.yieldNow()
    assert.strictEqual(calls.length, 3)
    yield* Deferred.succeed(deferreds[2]!, undefined)
    yield* Fiber.join(fiberAgain)

    yield* Deferred.succeed(deferreds[1]!, undefined)
    yield* Fiber.join(fiberB)
    assert.strictEqual(b.calls.reload, 1)
    assert.deepStrictEqual(controller.getSnapshot().inflight, {})
  }),
)

it.effect("401 rejects the session without feedback or reload and clears the guard", () =>
  Effect.gen(function* () {
    const controller = createDecisionController(failingPost(401))
    const { req, calls } = makeReq()
    assert.strictEqual(yield* controller.decide(req), true)
    assert.strictEqual(calls.reject, 1)
    assert.strictEqual(calls.reload, 0)
    assert.strictEqual(controller.getSnapshot().feedback, null)
    assert.deepStrictEqual(controller.getSnapshot().inflight, {})
  }),
)

it.effect("success reloads the relevant scope and leaves no feedback", () =>
  Effect.gen(function* () {
    const controller = createDecisionController(() => Effect.succeed(undefined))
    const { req, calls } = makeReq({ scope: "reviewed" })
    yield* controller.decide(req)
    assert.strictEqual(calls.reload, 1)
    assert.strictEqual(calls.reject, 0)
    assert.strictEqual(controller.getSnapshot().feedback, null)
    assert.deepStrictEqual(controller.getSnapshot().inflight, {})
  }),
)

it.effect("409 and 404 reconcile the relevant list and keep durable feedback that names no moderation outcome", () =>
  Effect.gen(function* () {
    for (const [status, kind] of [[409, "conflict"], [404, "missing"]] as const) {
      const controller = createDecisionController(failingPost(status))
      const { req, calls } = makeReq({ scope: "pending" })
      yield* controller.decide(req)
      assert.strictEqual(calls.reload, 1)
      assert.strictEqual(calls.reject, 0)
      assert.deepStrictEqual(controller.getSnapshot().feedback, { id: "report-a", scope: "pending", kind })
      assert.deepStrictEqual(controller.getSnapshot().inflight, {})
      // Feedback is owned above the rows: a later reload does not erase it.
      req.reload()
      assert.deepStrictEqual(controller.getSnapshot().feedback, { id: "report-a", scope: "pending", kind })
      assert.strictEqual(DECISION_FAILURE_COPY[kind].reload, false)
    }
    assert.include(DECISION_FAILURE_COPY.conflict.body, "sudah berubah")
  }),
)

it.effect("definite request rejections leave controls available without an automatic reload", () =>
  Effect.gen(function* () {
    for (const status of [400, 403, 405]) {
      const controller = createDecisionController(failingPost(status))
      const { req, calls } = makeReq()
      yield* controller.decide(req)
      assert.strictEqual(calls.reload, 0)
      assert.strictEqual(calls.reject, 0)
      assert.deepStrictEqual(controller.getSnapshot().feedback, { id: "report-a", scope: "pending", kind: "unavailable" })
      assert.deepStrictEqual(controller.getSnapshot().inflight, {})
    }
  }),
)

it.effect("network loss and server errors leave an uncertain outcome and offer reconciliation without resubmitting", () =>
  Effect.gen(function* () {
    for (const status of [0, 500, 502, 503]) {
      const controller = createDecisionController(failingPost(status))
      const { req, calls } = makeReq()
      yield* controller.decide(req)
      assert.strictEqual(calls.reload, 0)
      assert.strictEqual(calls.reject, 0)
      assert.deepStrictEqual(controller.getSnapshot().feedback, { id: "report-a", scope: "pending", kind: "unknown" })
      assert.deepStrictEqual(controller.getSnapshot().inflight, {})
      const copy = DECISION_FAILURE_COPY.unknown
      assert.strictEqual(copy.reload, true)
      assert.include(copy.body, "mungkin sudah tersimpan")
    }
  }),
)

it.effect("a settlement after invalidate fires no stale callbacks, and a fresh decision still works", () =>
  Effect.gen(function* () {
    const { post, deferreds } = controlledPost()
    const controller = createDecisionController(post)
    const { req, calls } = makeReq()
    const fiber = yield* Effect.fork(controller.decide(req))
    yield* Effect.yieldNow()
    controller.invalidate()
    yield* Deferred.succeed(deferreds[0]!, undefined)
    assert.strictEqual(yield* Fiber.join(fiber), false)
    assert.strictEqual(calls.reload, 0)
    assert.strictEqual(calls.reject, 0)
    assert.strictEqual(controller.getSnapshot().feedback, null)
    assert.deepStrictEqual(controller.getSnapshot().inflight, {})

    const fresh = makeReq({ body: approve("report-fresh") })
    const freshFiber = yield* Effect.fork(controller.decide(fresh.req))
    yield* Effect.yieldNow()
    assert.strictEqual(controller.getSnapshot().inflight["report-fresh"], "approve")
    yield* Fiber.interrupt(freshFiber)
  }),
)

it.effect("failure mapping covers the worker statuses and the copy exposes no secret or private data", () =>
  Effect.sync(() => {
    assert.strictEqual(decisionFailureKind(409), "conflict")
    assert.strictEqual(decisionFailureKind(404), "missing")
    assert.strictEqual(decisionFailureKind(0), "unknown")
    for (const status of [500, 502, 503, 599]) assert.strictEqual(decisionFailureKind(status), "unknown")
    for (const status of [400, 403, 405]) assert.strictEqual(decisionFailureKind(status), "unavailable")
    for (const kind of ["conflict", "missing", "unavailable", "unknown"] as const) {
      const copy = DECISION_FAILURE_COPY[kind]
      assert.ok(copy.title.length > 0)
      assert.ok(copy.body.length > 0)
      assert.notInclude(copy.title, "synthetic-secret")
      assert.notInclude(copy.body, "synthetic-secret")
      assert.notInclude(copy.body, "Bearer")
    }
  }),
)
it.effect("an unresolved report warning survives another report's success and new request in the same list", () =>
  Effect.gen(function* () {
    for (const scope of ["pending", "reviewed"] as const) {
      const { post, calls, deferreds } = controlledPost()
      const controller = createDecisionController(post)
      const a = makeReq({ scope, body: approve("report-a") })
      const b = makeReq({ scope, body: approve("report-b") })
      const fiberA = yield* Effect.fork(controller.decide(a.req))
      const fiberB = yield* Effect.fork(controller.decide(b.req))
      yield* Effect.yieldNow()
      assert.strictEqual(calls.length, 2)
      yield* Deferred.fail(deferreds[0]!, new LaporanClientError({ status: 0 }))
      yield* Fiber.join(fiberA)
      const warning = controller.getSnapshot().feedback
      assert.strictEqual(warning?.kind, "unknown")

      yield* Deferred.succeed(deferreds[1]!, undefined)
      yield* Fiber.join(fiberB)
      assert.strictEqual(b.calls.reload, 1)
      assert.strictEqual(controller.getSnapshot().feedback, warning)

      const anotherB = yield* Effect.fork(controller.decide(b.req))
      yield* Effect.yieldNow()
      assert.strictEqual(controller.getSnapshot().feedback, warning)
      yield* Deferred.succeed(deferreds[2]!, undefined)
      yield* Fiber.join(anotherB)
      assert.strictEqual(controller.getSnapshot().feedback, warning)
      assert.deepStrictEqual(warning, { id: "report-a", scope, kind: "unknown" })

      // A retry can clear its own warning; B never resolves A.
      const retryA = yield* Effect.fork(controller.decide(a.req))
      yield* Effect.yieldNow()
      assert.strictEqual(controller.getSnapshot().feedback, null)
      yield* Deferred.succeed(deferreds[3]!, undefined)
      yield* Fiber.join(retryA)
      assert.strictEqual(a.calls.reload, 1)
      assert.deepStrictEqual(controller.getSnapshot().inflight, {})
    }
  }),
)
