import { Context, Data, Effect, Layer, Schema } from "effect"
import { FreshPayloadSchema } from "../data/fresh-payload.ts"
import { CivilDateSchema } from "../data/price-schema.ts"
import { STATIC_LIVE_THROUGH } from "../data/fresh-prices.ts"
import { d1PriceStoreLayer, type D1Database } from "./d1-store.ts"
import { injectFreshScript } from "./html.ts"
import { ingestRecent, PihpsHttpLive, PriceStore } from "./ingest.ts"
import { handleLaporan, laporanEdgeFromEnv, laporanHttpError } from "./laporan-http.ts"
import { laporanStoreLayer, type PhotoBucket } from "./laporan-store.ts"
import { handlePriceRequest } from "./price-http.ts"
import { priceReadStoreLayer } from "./price-store.ts"
import { pihpsHealth } from "./pihps-health.ts"

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>
}

export type WorkerEnv = {
  DB: D1Database
  ASSETS: AssetFetcher
  PHOTOS: PhotoBucket
  ADMIN_SECRET?: string
  TURNSTILE_SECRET?: string
  TURNSTILE_SITE_KEY?: string
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
}

class AssetError extends Data.TaggedError("AssetError")<{
  readonly message: string
}> {}

class Assets extends Context.Tag("Assets")<
  Assets,
  {
    readonly fetch: (request: Request) => Effect.Effect<Response, AssetError>
  }
>() {}

const assetsLayer = (assets: AssetFetcher) =>
  Layer.succeed(Assets, {
    fetch: (request) =>
      Effect.tryPromise({
        try: () => assets.fetch(request),
        catch: (cause) => new AssetError({ message: String(cause) }),
      }),
  })

export const workerLayer = (env: WorkerEnv) =>
  Layer.mergeAll(
    d1PriceStoreLayer(env.DB),
    priceReadStoreLayer(env.DB),
    PihpsHttpLive,
    assetsLayer(env.ASSETS),
    laporanStoreLayer(env.DB, env.PHOTOS),
    laporanEdgeFromEnv(env),
  )

const freshJson = Effect.fn("Worker.freshJson")(function* (after: string) {
  const store = yield* PriceStore
  return yield* store.freshSince(after).pipe(
    Effect.flatMap(Schema.decodeUnknown(FreshPayloadSchema)),
    Effect.map((payload) => Response.json(payload, { headers: { "cache-control": "no-store" } })),
    Effect.catchAll(() => Effect.logError({ event: "pihps_freshness_unavailable", surface: "api" }).pipe(
      Effect.as(Response.json({ error: "freshness_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } })),
    )),
  )
})

/** Serve the freshness API, and stamp HTML shells with the same payload. */
const stampAdminRobots = (html: string): string =>
  html.replace('name="robots" content="index, follow"', 'name="robots" content="noindex, nofollow"')

export const handleRequest = Effect.fn("Worker.handleRequest")(function* (request: Request) {
  const url = new URL(request.url)
  if (url.pathname === "/api/pihps/health") {
    if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET", "cache-control": "no-store" } })
    return yield* pihpsHealth()
  }
  const laporan = yield* handleLaporan(request).pipe(
    Effect.catchAll((error) => {
      const response = laporanHttpError(error)
      if (response != null) return Effect.succeed(response)
      return Effect.fail(error)
    }),
  )
  if (laporan != null) return laporan
  const prices = yield* handlePriceRequest(request)
  if (prices != null) return prices
  if (url.pathname === "/api/pihps/fresh") {
    const after = url.searchParams.get("after") ?? STATIC_LIVE_THROUGH
    if (!Schema.is(CivilDateSchema)(after)) {
      return Response.json({ error: "after must be YYYY-MM-DD" }, { status: 400 })
    }
    return yield* freshJson(after)
  }

  const assets = yield* Assets
  const asset = yield* assets.fetch(request)
  const type = asset.headers.get("content-type") ?? ""
  if (!type.includes("text/html")) return asset
  const html = yield* Effect.tryPromise({
    try: () => asset.text(),
    catch: (cause) => new AssetError({ message: String(cause) }),
  })
  const store = yield* PriceStore
  const payload = yield* store.freshSince(STATIC_LIVE_THROUGH).pipe(
    Effect.flatMap(Schema.decodeUnknown(FreshPayloadSchema)),
    Effect.catchAll(() => Effect.logError({ event: "pihps_freshness_unavailable", surface: "html" }).pipe(Effect.as(null))),
  )
  const headers = new Headers(asset.headers)
  headers.set("content-type", "text/html; charset=utf-8")
  headers.set("cache-control", "no-store")
  headers.delete("content-length")
  const admin = url.pathname === "/admin" || url.pathname === "/admin/"
  if (admin) headers.set("x-robots-tag", "noindex, nofollow")
  const stamped = admin ? stampAdminRobots(html) : html
  return new Response(payload == null ? stamped : injectFreshScript(stamped, payload), { status: asset.status, headers })
})

/** One survey day at each weekday trigger, allowing delayed same-day publication. */
const CRON_MAX_DAYS = 1

export const handleScheduled = Effect.fn("Worker.scheduled")(function* () {
  return yield* ingestRecent(CRON_MAX_DAYS)
})

type WaitUntil = { waitUntil(promise: Promise<unknown>): void }

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return Effect.runPromise(
      handleRequest(request).pipe(
        Effect.provide(workerLayer(env)),
        Effect.catchAllCause((cause) =>
          Effect.logError(cause).pipe(Effect.as(Response.json({ error: "pihps" }, { status: 500 }))),
        ),
      ),
    )
  },
  scheduled(_event: unknown, env: WorkerEnv, ctx: WaitUntil): void {
    ctx.waitUntil(
      Effect.runPromise(
        handleScheduled().pipe(Effect.provide(workerLayer(env))),
      ),
    )
  },
}
