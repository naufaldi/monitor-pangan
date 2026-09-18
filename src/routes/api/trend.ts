import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { errorResponse, searchInput } from "#/server/http.ts"
import { parseTrendQuery } from "#/server/params.ts"
import { getDb, trendNational, trendSelected } from "#/server/queries.ts"

type HandlerEvent = {
  request: Request
}

export const Route = createFileRoute("/api/trend")({
  server: {
    handlers: {
      GET: ({ request }: HandlerEvent) =>
        Effect.runPromise(
          Effect.gen(function*() {
            const query = yield* parseTrendQuery(searchInput(request))
            const db = getDb()
            const national = yield* trendNational(
              db,
              query.commodity.id,
              query.from,
              query.to,
              query.cursor,
              query.limit,
            )
            const selected =
              query.region == null
                ? null
                : yield* trendSelected(
                    db,
                    query.commodity.id,
                    query.region,
                    query.from,
                    query.to,
                    query.cursor,
                    query.limit,
                  )
            return Response.json({
              commodity: query.commodity,
              national,
              selected,
              nextCursor:
                national.length === query.limit ? (national[national.length - 1]?.date ?? null) : null,
            })
          }).pipe(Effect.catchAll((error) => Effect.succeed(errorResponse(error)))),
        ),
    },
  },
})
