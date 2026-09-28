import { Context, Data, Effect, Layer } from "effect"
import { emptyFreshPayload } from "../data/fresh-payload.ts"
import { STATIC_LIVE_THROUGH } from "../data/fresh-prices.ts"
import { d1PriceStoreLayer, type D1Database } from "./d1-store.ts"
import { injectFreshScript } from "./html.ts"
import { ingestRecent, PihpsHttpLive, PriceStore } from "./ingest.ts"

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>
}

export type WorkerEnv = {
  DB: D1Database
  ASSETS: AssetFetcher
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
  Layer.mergeAll(d1PriceStoreLayer(env.DB), PihpsHttpLive, assetsLayer(env.ASSETS))

const isoDate = /^\d{4}-\d{2}-\d{2}$/

const freshJson = Effect.fn("Worker.freshJson")(function* (after: string) {
  const store = yield* PriceStore
  const payload = yield* store.freshSince(after).pipe(
    Effect.tapError((error) => Effect.logError(error.message)),
    Effect.catchAll(() => Effect.succeed(emptyFreshPayload)),
  )
  return Response.json(payload, { headers: { "cache-control": "no-store" } })
})

/** Serve the freshness API, and stamp HTML shells with the same payload. */
export const handleRequest = Effect.fn("Worker.handleRequest")(function* (request: Request) {
  const url = new URL(request.url)
  if (url.pathname === "/api/pihps/fresh") {
    const after = url.searchParams.get("after") ?? STATIC_LIVE_THROUGH
    if (!isoDate.test(after)) {
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
    Effect.catchAll(() => Effect.succeed(emptyFreshPayload)),
  )
  const headers = new Headers(asset.headers)
  headers.set("content-type", "text/html; charset=utf-8")
  headers.set("cache-control", "no-store")
  headers.delete("content-length")
  return new Response(injectFreshScript(html, payload), { status: asset.status, headers })
})

/** One trading day per run. Weekday crons after the 13:00 WIB release cover the next day. */
export const CRON_MAX_DAYS = 1

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
        ingestRecent(CRON_MAX_DAYS).pipe(
          Effect.provide(workerLayer(env)),
          Effect.catchAllCause((cause) => Effect.logError(cause)),
        ),
      ),
    )
  },
}
