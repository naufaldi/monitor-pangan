import { Data, Effect, Schema } from "effect"
import {
  AdminQueueSchema,
  AdminReviewedPageSchema,
  type DecideBody,
  type LaporanQuery,
  ReportsPayloadSchema,
  type SubmitBody,
} from "#/data/laporan.ts"

export class LaporanClientError extends Data.TaggedError("LaporanClientError")<{
  readonly status: number
}> {}

const failed = (status: number) => new LaporanClientError({ status })

const readJson = (response: Response) =>
  Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: () => failed(response.status),
  })

/** Public page of reviewed reports. */
export const fetchReports = (query: LaporanQuery) =>
  Effect.gen(function* () {
    const params = new URLSearchParams({
      outlet: query.outlet,
      window: query.windowOnly ? "1" : "0",
      limit: String(query.limit),
    })
    if (query.commodityId != null) params.set("commodityId", query.commodityId)
    if (query.cursor != null) params.set("cursor", query.cursor)
    const response = yield* Effect.tryPromise({
      try: () => fetch(`/api/laporan?${params.toString()}`),
      catch: () => failed(0),
    })
    if (!response.ok) return yield* Effect.fail(failed(response.status))
    const json = yield* readJson(response)
    return yield* Schema.decodeUnknown(ReportsPayloadSchema)(json).pipe(
      Effect.mapError(() => failed(response.status)),
    )
  })

/** Turnstile site key. Null until the Worker secret is set. */
export const fetchTurnstileSiteKey = Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () => fetch("/api/laporan/meta"),
    catch: () => failed(0),
  })
  if (!response.ok) return yield* Effect.fail(failed(response.status))
  const json = yield* readJson(response)
  if (typeof json !== "object" || json == null || !("turnstileSiteKey" in json)) return null
  const key = json.turnstileSiteKey
  return typeof key === "string" && key.length > 0 ? key : null
})

export const postReport = (body: SubmitBody) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("/api/laporan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      catch: () => failed(0),
    })
    const json = yield* readJson(response)
    if (!response.ok) return yield* Effect.fail(failed(response.status))
    const uploadUrl =
      typeof json === "object" && json != null && "uploadUrl" in json && typeof json.uploadUrl === "string"
        ? json.uploadUrl
        : null
    const id = typeof json === "object" && json != null && "id" in json && typeof json.id === "string" ? json.id : body.id
    return { id, uploadUrl }
  })

export const putPhoto = (uploadUrl: string, blob: Blob) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(uploadUrl, { method: "PUT", body: blob, headers: { "content-type": "image/jpeg" } }),
      catch: () => failed(0),
    })
    if (!response.ok) return yield* Effect.fail(failed(response.status))
  })

const adminGet = (secret: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(path, { headers: { authorization: `Bearer ${secret}` } }),
      catch: () => failed(0),
    })
    if (!response.ok) return yield* Effect.fail(failed(response.status))
    return yield* readJson(response)
  })

/** Pending queue, oldest submission first. */
export const fetchQueue = (secret: string) =>
  Effect.gen(function* () {
    const json = yield* adminGet(secret, "/api/admin/queue")
    return yield* Schema.decodeUnknown(AdminQueueSchema)(json).pipe(Effect.mapError(() => failed(200)))
  })

export const postDecision = (secret: string, body: DecideBody) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("/api/admin/decide", {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      catch: () => failed(0),
    })
    if (!response.ok) return yield* Effect.fail(failed(response.status))
  })

/** Reviewed rows, newest decision first. */
export const fetchReviewed = (secret: string, cursor: string | null) =>
  Effect.gen(function* () {
    const path = cursor == null ? "/api/admin/reviewed" : `/api/admin/reviewed?cursor=${encodeURIComponent(cursor)}`
    const json = yield* adminGet(secret, path)
    return yield* Schema.decodeUnknown(AdminReviewedPageSchema)(json).pipe(Effect.mapError(() => failed(200)))
  })

/** Object URL for a pending or decided photo. The caller revokes it. */
export const fetchAdminPhotoUrl = (secret: string, id: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(`/api/admin/foto/${id}`, { headers: { authorization: `Bearer ${secret}` } }),
      catch: () => failed(0),
    })
    if (response.status === 404) return null
    if (!response.ok) return yield* Effect.fail(failed(response.status))
    const blob = yield* Effect.tryPromise({
      try: () => response.blob(),
      catch: () => failed(response.status),
    })
    return URL.createObjectURL(blob)
  })
