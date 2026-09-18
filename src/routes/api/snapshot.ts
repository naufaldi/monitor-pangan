import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { errorResponse, searchInput } from "#/server/http.ts"
import { parseSnapshotQuery } from "#/server/params.ts"
import { getDb, round50, snapshotRows } from "#/server/queries.ts"

type HandlerEvent = {
  request: Request
}

export const Route = createFileRoute("/api/snapshot")({
  server: {
    handlers: {
      GET: ({ request }: HandlerEvent) =>
        Effect.runPromise(
          Effect.gen(function*() {
            const query = yield* parseSnapshotQuery(searchInput(request))
            const rows = yield* snapshotRows(getDb(), query.date, query.commodity.id)
            const priced = rows.filter((row): row is { regionCode: string; price: number } => row.price != null)
            const nationalAvg =
              priced.length === 0
                ? 0
                : round50(priced.reduce((sum, row) => sum + row.price, 0) / priced.length)
            return Response.json({
              date: query.date,
              commodity: query.commodity,
              nationalAvg,
              pricedCount: priced.length,
              rows,
            })
          }).pipe(Effect.catchAll((error) => Effect.succeed(errorResponse(error)))),
        ),
    },
  },
})
