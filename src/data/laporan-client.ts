import { Data, Effect, Schema } from "effect"
import {
  AdminQueueSchema,
  AdminReviewedPageSchema,
  type DecideBody,
  type LaporanQuery,
  type Outlet,
  type PublicReport,
  type ReportsPayload,
  ReportsPayloadSchema,
  SubmitResponseSchema,
  type SubmitBody,
} from "#/data/laporan.ts"
import { MAX_PAGE_SIZE } from "#/lib/laporan.ts"

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
export const fetchReports = (query: LaporanQuery, fetcher: typeof fetch = fetch) =>
  Effect.gen(function* () {
    const params = new URLSearchParams({
      outlet: query.outlet,
      window: query.windowOnly ? "1" : "0",
      limit: String(query.limit),
    })
    if (query.commodityId != null) params.set("commodityId", query.commodityId)
    if (query.cursor != null) params.set("cursor", query.cursor)
    const response = yield* Effect.tryPromise({
      try: () => fetcher(`/api/laporan?${params.toString()}`),
      catch: () => failed(0),
    })
    if (!response.ok) return yield* Effect.fail(failed(response.status))
    const json = yield* readJson(response)
    return yield* Schema.decodeUnknown(ReportsPayloadSchema)(json).pipe(
      Effect.mapError(() => failed(response.status)),
    )
  })

/** Page bound for one 30-day window. The store has no matching total cap. */
export const WINDOW_MAX_PAGES = 20

/** The window holds more reviewed reports than the page bound can fetch. */
export class WindowCapacityError extends Data.TaggedError("WindowCapacityError") {}

/** Loads one outlet's 30-day window. Succeeds only when pagination completes within the bound. */
export const loadWindow = (outlet: Outlet, commodityId: string | null, fetcher: typeof fetch = fetch) =>
  Effect.gen(function* () {
    const pages: PublicReport[][] = []
    let cursor: string | null = null
    for (let page = 0; page < WINDOW_MAX_PAGES; page += 1) {
      const payload: ReportsPayload = yield* fetchReports(
        {
          outlet,
          commodityId,
          cursor,
          windowOnly: true,
          limit: MAX_PAGE_SIZE,
        },
        fetcher,
      )
      pages.push([...payload.rows])
      cursor = payload.nextCursor
      if (cursor == null) return pages.flat()
    }
    // A live cursor after the last allowed page means more reviewed rows exist.
    // Returning them as success would present a truncated window as complete.
    return yield* Effect.fail(new WindowCapacityError())
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

export const postReport = (body: SubmitBody, fetcher: typeof fetch = fetch) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetcher("/api/laporan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      catch: () => failed(0),
    })
    const json = yield* readJson(response)
    if (!response.ok) return yield* Effect.fail(failed(response.status))
    return yield* Schema.decodeUnknown(SubmitResponseSchema)(json).pipe(Effect.mapError(() => failed(response.status)))
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
