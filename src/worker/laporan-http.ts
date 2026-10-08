import { Context, Data, DateTime, Effect, Layer, Schema } from "effect"
import { COMMODITIES } from "#/data/catalog.ts"
import { DecideBodySchema, SubmitBodySchema } from "#/data/laporan.ts"
import { todayInJakarta } from "#/lib/jakarta-today.ts"
import { LIST_PAGE_SIZE } from "#/lib/laporan.ts"
import { bearerMatches } from "./admin-auth.ts"
import { presignPendingPut, type PresignConfig, SignError } from "./r2-sign.ts"
import {
  CursorRejected,
  DecisionConflict,
  LaporanStore,
  LaporanStoreError,
  ReportMissing,
  SubmitRejected,
} from "./laporan-store.ts"

export class TurnstileRejected extends Data.TaggedError("TurnstileRejected")<{}> {}

export class LaporanEdge extends Context.Tag("LaporanEdge")<
  LaporanEdge,
  {
    readonly adminSecret: string
    readonly siteKey: string | null
    readonly verify: (token: string) => Effect.Effect<void, TurnstileRejected>
    readonly presign: ((id: string, nowMs: number) => Effect.Effect<string, SignError>) | null
  }
>() {}

const MAX_BODY = 8192

const noStore = { "cache-control": "no-store" }

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore })

const invalid = () => json({ error: "invalid" }, 400)

/** Siteverify. An empty secret rejects the token. The client IP is not stored. */
export const verifyTurnstileToken = (token: string, secret: string) =>
  Effect.gen(function* () {
    if (secret.length === 0 || token.length === 0) return yield* Effect.fail(new TurnstileRejected())
    const payload = yield* Effect.tryPromise({
      try: () =>
        fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token }).toString(),
        }).then((response) => response.json() as Promise<unknown>),
      catch: () => new TurnstileRejected(),
    })
    if (typeof payload !== "object" || payload == null || !("success" in payload) || payload.success !== true) {
      return yield* Effect.fail(new TurnstileRejected())
    }
  })

export const laporanEdgeFromEnv = (env: {
  ADMIN_SECRET?: string
  TURNSTILE_SECRET?: string
  TURNSTILE_SITE_KEY?: string
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
}) => {
  const config: PresignConfig | null =
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME
      ? {
          accountId: env.R2_ACCOUNT_ID,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          bucket: env.R2_BUCKET_NAME,
        }
      : null
  return Layer.succeed(LaporanEdge, {
    adminSecret: env.ADMIN_SECRET ?? "",
    siteKey: env.TURNSTILE_SITE_KEY ?? null,
    verify: (token) => verifyTurnstileToken(token, env.TURNSTILE_SECRET ?? ""),
    presign: config == null ? null : (id, nowMs) => presignPendingPut(config, id, nowMs),
  })
}

const readJson = (request: Request) =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => request.text(),
      catch: () => new SubmitRejected({ message: "invalid" }),
    })
    if (text.length > MAX_BODY) return yield* Effect.fail(new SubmitRejected({ message: "invalid" }))
    return yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () => new SubmitRejected({ message: "invalid" }),
    })
  })

const requireAdmin = (request: Request) =>
  Effect.gen(function* () {
    const edge = yield* LaporanEdge
    if (!bearerMatches(request.headers.get("authorization"), edge.adminSecret)) {
      return yield* Effect.fail("unauthorized" as const)
    }
  })

const uuidParam = (value: string): string | null =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null

const photoResponse = (body: ReadableStream | Uint8Array | ArrayBuffer, cache: string) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "image/jpeg", "cache-control": cache },
  })

/** Citizen and admin HTTP. Paths that are not this lane return null. */
export const handleLaporan = Effect.fn("Laporan.handle")(function* (request: Request) {
  const url = new URL(request.url)
  const { pathname } = url
  if (
    pathname !== "/api/laporan" &&
    pathname !== "/api/laporan/meta" &&
    !pathname.startsWith("/api/admin/") &&
    !pathname.startsWith("/foto/")
  ) {
    return null
  }

  if (pathname === "/api/laporan/meta" && request.method === "GET") {
    const edge = yield* LaporanEdge
    return json({ turnstileSiteKey: edge.siteKey })
  }

  if (pathname === "/api/laporan" && request.method === "GET") return yield* listReports(url)
  if (pathname === "/api/laporan" && request.method === "POST") return yield* submitReport(request)

  const publicPhoto = /^\/foto\/([^/]+)$/.exec(pathname)
  if (publicPhoto != null && request.method === "GET") {
    const id = uuidParam(publicPhoto[1] ?? "")
    if (id == null) return json({ error: "missing" }, 404)
    const store = yield* LaporanStore
    const photo = yield* store.publicPhoto(id)
    if (photo == null) return json({ error: "missing" }, 404)
    return photoResponse(photo.body, "public, max-age=600")
  }

  if (!pathname.startsWith("/api/admin/")) return json({ error: "method" }, 405)
  const allowed = yield* requireAdmin(request).pipe(Effect.option)
  if (allowed._tag === "None") return json({ error: "unauthorized" }, 401)

  if (pathname === "/api/admin/queue" && request.method === "GET") {
    const store = yield* LaporanStore
    const items = yield* store.pending()
    return json({ items })
  }

  if (pathname === "/api/admin/reviewed" && request.method === "GET") {
    const store = yield* LaporanStore
    const now = yield* DateTime.now
    const page = yield* store.reviewedPage(url.searchParams.get("cursor"), now.epochMillis)
    return json(page)
  }

  const adminPhoto = /^\/api\/admin\/foto\/([^/]+)$/.exec(pathname)
  if (adminPhoto != null && request.method === "GET") {
    const id = uuidParam(adminPhoto[1] ?? "")
    if (id == null) return json({ error: "missing" }, 404)
    const store = yield* LaporanStore
    const photo = yield* store.adminPhoto(id)
    if (photo == null) return json({ error: "missing" }, 404)
    return photoResponse(photo.body, "private, no-store")
  }

  if (pathname === "/api/admin/decide" && request.method === "POST") return yield* decideReport(request)

  return json({ error: "method" }, 405)
})

const listReports = Effect.fn("Laporan.list")(function* (url: URL) {
  const outlet = url.searchParams.get("outlet")
  if (outlet !== "pasar" && outlet !== "ritel") return invalid()
  const commodityRaw = url.searchParams.get("commodityId")
  const commodityId = commodityRaw == null || commodityRaw === "" ? null : commodityRaw
  if (commodityId != null && !COMMODITIES.some((commodity) => commodity.id === commodityId)) return invalid()
  const windowRaw = url.searchParams.get("window") ?? "1"
  if (windowRaw !== "0" && windowRaw !== "1") return invalid()
  const limitRaw = url.searchParams.get("limit")
  const limit = limitRaw == null || limitRaw === "" ? LIST_PAGE_SIZE : Number(limitRaw)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return invalid()
  const store = yield* LaporanStore
  const today = yield* todayInJakarta()
  const now = yield* DateTime.now
  const payload = yield* store.reports(
    {
      outlet,
      commodityId,
      cursor: url.searchParams.get("cursor"),
      windowOnly: windowRaw === "1",
      limit,
    },
    today,
    now.epochMillis,
  )
  return json(payload)
})

const submitReport = Effect.fn("Laporan.submit")(function* (request: Request) {
  const raw = yield* readJson(request)
  const body = yield* Schema.decodeUnknown(SubmitBodySchema)(raw).pipe(
    Effect.mapError(() => new SubmitRejected({ message: "invalid" })),
  )
  const edge = yield* LaporanEdge
  yield* edge.verify(body.turnstileToken)
  if (body.photo && edge.presign == null) return json({ error: "upload" }, 503)
  const store = yield* LaporanStore
  const seenOn = yield* todayInJakarta()
  const now = yield* DateTime.now
  const saved = yield* store.submit(body, seenOn, DateTime.formatIso(now))
  const uploadUrl =
    saved.photoKey != null && saved.photoKey.startsWith("pending/") && edge.presign != null
      ? yield* edge.presign(saved.id, now.epochMillis).pipe(Effect.catchAll(() => Effect.succeed(null)))
      : null
  return json({ id: saved.id, status: "pending", uploadUrl })
})

const decideReport = Effect.fn("Laporan.decide")(function* (request: Request) {
  const raw = yield* readJson(request)
  const body = yield* Schema.decodeUnknown(DecideBodySchema)(raw).pipe(
    Effect.mapError(() => new SubmitRejected({ message: "invalid" })),
  )
  const store = yield* LaporanStore
  const now = yield* DateTime.now
  const result = yield* store.decide(body, DateTime.formatIso(now), now.epochMillis)
  return json(result)
})

/** Map lane failures onto HTTP. The caller logs anything else. */
export const laporanHttpError = (error: unknown): Response | null => {
  if (error instanceof SubmitRejected || error instanceof TurnstileRejected || error instanceof CursorRejected) {
    return invalid()
  }
  if (error instanceof DecisionConflict) return json({ error: "conflict" }, 409)
  if (error instanceof ReportMissing) return json({ error: "missing" }, 404)
  if (error instanceof LaporanStoreError || error instanceof SignError) return json({ error: "store" }, 500)
  return null
}
