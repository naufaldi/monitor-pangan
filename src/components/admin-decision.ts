import { Effect } from "effect"
import { LaporanClientError, postDecision } from "#/data/laporan-client.ts"
import type { DecideBody } from "#/data/laporan.ts"

export type DecisionScope = "pending" | "reviewed"
export type DecisionFailureKind = "conflict" | "missing" | "unavailable" | "unknown"
export type DecisionFeedback = { readonly id: string; readonly scope: DecisionScope; readonly kind: DecisionFailureKind }
export type DecisionSnapshot = {
  readonly inflight: Readonly<Record<string, DecideBody["action"]>>
  readonly feedback: DecisionFeedback | null
}

/** 401 is routed separately. Neither a lost response nor a server error establishes rollback. */
export function decisionFailureKind(status: number): DecisionFailureKind {
  if (status >= 500 && status <= 599) return "unknown"
  switch (status) {
    case 409:
      return "conflict"
    case 404:
      return "missing"
    case 0:
      return "unknown"
    default:
      return "unavailable"
  }
}

/**
 * Honest moderator copy. Conflict never names a moderation outcome: the report may have been
 * decided by someone else. Unknown never claims success or failure because the server may have
 * persisted the decision before a later read failed or the response was lost. No token, internal error, or private field.
 */
export const DECISION_FAILURE_COPY: Record<DecisionFailureKind, { title: string; body: string; reload: boolean }> = {
  conflict: {
    title: "Keputusan tidak bisa diterapkan.",
    body: "Status laporan ini sudah berubah, misalnya sudah ditinjau moderator lain. Daftar diperbarui; periksa kembali sebelum memutuskan.",
    reload: false,
  },
  missing: {
    title: "Laporan tidak ditemukan.",
    body: "Laporan mungkin sudah dihapus atau kedaluwarsa. Daftar diperbarui.",
    reload: false,
  },
  unavailable: {
    title: "Permintaan keputusan ditolak.",
    body: "Periksa permintaan dan akses Anda sebelum mencoba lagi melalui tombol pada laporan.",
    reload: false,
  },
  unknown: {
    title: "Hasil keputusan belum diketahui.",
    body: "Hasil permintaan tidak dapat dipastikan; keputusan mungkin sudah tersimpan. Muat ulang daftar untuk memeriksa sebelum mencoba lagi.",
    reload: true,
  },
}

export type DecisionPost = (secret: string, body: DecideBody) => Effect.Effect<void, LaporanClientError>

export type DecideRequest = {
  readonly secret: string
  readonly scope: DecisionScope
  readonly body: DecideBody
  readonly onReject: () => void
  readonly reload: () => void
}

export type DecisionController = {
  /** False when a decision for this report is already in flight. */
  readonly decide: (request: DecideRequest) => Effect.Effect<boolean>
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => DecisionSnapshot
  /** Drop stale settlements after a secret change or unmount. */
  readonly invalidate: () => void
}

/**
 * Owns the decision request lifecycle so the guard, outcome routing, and durable feedback are
 * provable without a DOM. One instance per AdminDesk mount; queue/reviewed data stays in AdminDesk.
 */
export function createDecisionController(post: DecisionPost = postDecision): DecisionController {
  let inflight: Record<string, DecideBody["action"]> = {}
  let feedback: DecisionFeedback | null = null
  let snapshot: DecisionSnapshot = { inflight, feedback }
  let generation = 0
  const listeners = new Set<() => void>()

  const notify = () => {
    snapshot = { inflight, feedback }
    for (const listener of listeners) listener()
  }
  const release = (id: string) => {
    const next = { ...inflight }
    delete next[id]
    inflight = next
  }
  const invalidate = () => {
    generation += 1
    inflight = {}
    feedback = null
    notify()
  }

  const decide = (request: DecideRequest): Effect.Effect<boolean> =>
    Effect.suspend(() => {
      const id = request.body.id
      if (id in inflight) return Effect.succeed(false)
      const settled = generation
      inflight = { ...inflight, [id]: request.body.action }
      // Only this report can resolve its warning; other reports remain independent.
      if (feedback != null && feedback.id === id) feedback = null
      notify()
      return post(request.secret, request.body).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (settled !== generation) return false
            const status = failure instanceof LaporanClientError ? failure.status : 0
            release(id)
            if (status === 401) {
              feedback = null
              notify()
              request.onReject()
              return true
            }
            const kind = decisionFailureKind(status)
            feedback = { id, scope: request.scope, kind }
            notify()
            if (kind === "conflict" || kind === "missing") request.reload()
            return true
          },
          onSuccess: () => {
            if (settled !== generation) return false
            release(id)
            if (feedback != null && feedback.id === id) feedback = null
            notify()
            request.reload()
            return true
          },
        }),
      )
    })

  return {
    decide,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    invalidate,
  }
}