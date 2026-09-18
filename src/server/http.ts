import { InvalidQueryError } from "#/server/params.ts"
import { DatabaseError } from "#/server/queries.ts"
import { UnknownCommodityError } from "#/data/price-schema.ts"

export type ApiError = InvalidQueryError | UnknownCommodityError | DatabaseError

/** Plain search object for Schema validation. */
export const searchInput = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams)

/** Map typed domain failures to HTTP responses. */
export function errorResponse(error: ApiError): Response {
  switch (error._tag) {
    case "InvalidQueryError":
      return Response.json({ error: "invalid_query", detail: error.detail }, { status: 400 })
    case "UnknownCommodityError":
      return Response.json(
        { error: "unknown_commodity", commodityId: error.commodityId },
        { status: 400 },
      )
    case "DatabaseError":
      return Response.json({ error: "database_error" }, { status: 500 })
  }
}
