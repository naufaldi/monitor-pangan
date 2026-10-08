import { Context, Data, Effect, Layer } from "effect"
import { COMMODITIES } from "#/data/catalog.ts"
import {
  aliasHasUrl,
  type DecideBody,
  type Evidence,
  type LaporanQuery,
  type Outlet,
  type PublicReport,
  type ReportStatus,
  type ReportsPayload,
  type SubmitBody,
} from "#/data/laporan.ts"
import { placeByCode } from "#/data/places.ts"
import { LIST_PAGE_SIZE, MAX_PAGE_SIZE, reportHasPhoto, windowStart } from "#/lib/laporan.ts"
import type { D1Database } from "./d1-store.ts"
import { ensureMigrated } from "./d1-store.ts"

export class LaporanStoreError extends Data.TaggedError("LaporanStoreError")<{
  readonly message: string
}> {}

export class SubmitRejected extends Data.TaggedError("SubmitRejected")<{
  readonly message: string
}> {}

export class CursorRejected extends Data.TaggedError("CursorRejected")<{}> {}

export class DecisionConflict extends Data.TaggedError("DecisionConflict")<{}> {}

export class ReportMissing extends Data.TaggedError("ReportMissing")<{}> {}

export type SubmitResult = {
  id: string
  created: boolean
  photoKey: string | null
}

export type AdminPending = {
  id: string
  commodityId: string
  outlet: Outlet
  price: number
  placeCode: string
  seenOn: string
  alias: string | null
  submittedAt: string
  photoKey: string | null
  pihpsPrice: number | null
}

export type AdminRecord = {
  id: string
  commodityId: string
  outlet: Outlet
  price: number
  placeCode: string
  seenOn: string
  alias: string | null
  status: ReportStatus
  evidence: Evidence | null
  submittedAt: string
  reviewedAt: string | null
  reviewNote: string | null
  photoKey: string | null
  hasPhoto: boolean
  pihpsPrice: number | null
}

export type DecideResult = {
  changed: boolean
  row: AdminRecord
}

export interface StoredPhoto {
  readonly body: ReadableStream | Uint8Array | ArrayBuffer
}

export interface PhotoBucket {
  get(key: string): Promise<StoredPhoto | null>
  put(
    key: string,
    value: ReadableStream | Uint8Array | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  delete(key: string): Promise<void>
}

type DbRow = {
  id: string
  commodity_id: string
  outlet: string
  price: number
  place_code: string
  seen_on: string
  alias: string | null
  photo_key: string | null
  status: string
  evidence: string | null
  submitted_at: string
  reviewed_at: string | null
  review_note: string | null
}

type QueueRow = DbRow & { pihps_price: number | null }

export class LaporanStore extends Context.Tag("LaporanStore")<
  LaporanStore,
  {
    readonly submit: (
      body: SubmitBody,
      seenOn: string,
      submittedAt: string,
    ) => Effect.Effect<SubmitResult, SubmitRejected | LaporanStoreError>
    readonly reports: (
      query: LaporanQuery,
      today: string,
      nowMs: number,
    ) => Effect.Effect<ReportsPayload, CursorRejected | LaporanStoreError>
    readonly pending: () => Effect.Effect<readonly AdminPending[], LaporanStoreError>
    readonly reviewedPage: (
      cursor: string | null,
      nowMs: number,
    ) => Effect.Effect<{ rows: readonly AdminRecord[]; nextCursor: string | null }, CursorRejected | LaporanStoreError>
    readonly decide: (
      body: DecideBody,
      nowIso: string,
      nowMs: number,
    ) => Effect.Effect<DecideResult, DecisionConflict | ReportMissing | LaporanStoreError>
    readonly publicPhoto: (id: string) => Effect.Effect<StoredPhoto | null, LaporanStoreError>
    readonly adminPhoto: (id: string) => Effect.Effect<StoredPhoto | null, LaporanStoreError>
  }
>() {}

const storeError = (cause: unknown) => new LaporanStoreError({ message: String(cause) })

const changesOf = (result: unknown): number => {
  if (typeof result !== "object" || result == null || !("meta" in result)) return 0
  const meta = result.meta
  if (typeof meta !== "object" || meta == null || !("changes" in meta)) return 0
  const changes = meta.changes
  if (typeof changes === "number") return changes
  if (typeof changes === "bigint") return Number(changes)
  return 0
}

const asOutlet = (value: string): Outlet | null => {
  switch (value) {
    case "pasar":
    case "ritel":
      return value
    default:
      return null
  }
}

const asStatus = (value: string): ReportStatus | null => {
  switch (value) {
    case "pending":
    case "reviewed":
    case "rejected":
      return value
    default:
      return null
  }
}

const asEvidence = (value: string | null): Evidence | null => {
  switch (value) {
    case "receipt":
    case "board":
    case "none":
      return value
    case null:
      return null
    default:
      return null
  }
}

const encodeCursor = (primary: string, id: string): string => {
  const bytes = new TextEncoder().encode(JSON.stringify({ primary, id }))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

const decodeCursor = (cursor: string) =>
  Effect.gen(function* () {
    const json = yield* Effect.try({
      try: () => {
        const pad = cursor.replaceAll("-", "+").replaceAll("_", "/")
        const padded = pad + "=".repeat((4 - (pad.length % 4)) % 4)
        const binary = atob(padded)
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown
      },
      catch: () => new CursorRejected(),
    })
    if (typeof json !== "object" || json == null) return yield* Effect.fail(new CursorRejected())
    const primary = "primary" in json ? json.primary : undefined
    const id = "id" in json ? json.id : undefined
    if (typeof primary !== "string" || typeof id !== "string") return yield* Effect.fail(new CursorRejected())
    return { primary, id }
  })

type PhotoStep = "move" | "rewrite" | "none"

type DecisionPlan =
  | { kind: "noop" }
  | { kind: "conflict" }
  | {
      kind: "apply"
      status: "reviewed" | "rejected"
      evidence: Evidence | null
      note: string | null
      photo: PhotoStep
    }

/** Status machine from the PRD. Anything outside it is a conflict. */
export function planDecision(status: ReportStatus, evidence: Evidence | null, body: DecideBody): DecisionPlan {
  switch (status) {
    case "pending":
      switch (body.action) {
        case "approve":
          return { kind: "apply", status: "reviewed", evidence: body.evidence, note: null, photo: "move" }
        case "reject":
          return { kind: "apply", status: "rejected", evidence: null, note: body.note, photo: "move" }
        case "takedown":
          return { kind: "conflict" }
        default: {
          const _exhaustive: never = body
          return _exhaustive
        }
      }
    case "reviewed":
      switch (body.action) {
        case "approve":
          return { kind: "noop" }
        case "reject":
          return { kind: "conflict" }
        case "takedown":
          return { kind: "apply", status: "rejected", evidence, note: body.note, photo: "rewrite" }
        default: {
          const _exhaustive: never = body
          return _exhaustive
        }
      }
    case "rejected":
      switch (body.action) {
        case "approve":
          return { kind: "conflict" }
        case "reject":
        case "takedown":
          return { kind: "noop" }
        default: {
          const _exhaustive: never = body
          return _exhaustive
        }
      }
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

const toAdmin = (row: DbRow, nowMs: number, pihpsPrice: number | null): AdminRecord | null => {
  const outlet = asOutlet(row.outlet)
  const status = asStatus(row.status)
  if (outlet == null || status == null) return null
  return {
    id: row.id,
    commodityId: row.commodity_id,
    outlet,
    price: row.price,
    placeCode: row.place_code,
    seenOn: row.seen_on,
    alias: row.alias,
    status,
    evidence: asEvidence(row.evidence),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    photoKey: row.photo_key,
    hasPhoto: reportHasPhoto(row.photo_key, row.reviewed_at, nowMs),
    pihpsPrice,
  }
}

const toPublic = (row: DbRow, nowMs: number): PublicReport | null => {
  if (row.status !== "reviewed") return null
  const outlet = asOutlet(row.outlet)
  const evidence = asEvidence(row.evidence)
  if (outlet == null || evidence == null) return null
  return {
    id: row.id,
    commodityId: row.commodity_id,
    outlet,
    price: row.price,
    placeCode: row.place_code,
    seenOn: row.seen_on,
    alias: row.alias,
    evidence,
    hasPhoto: reportHasPhoto(row.photo_key, row.reviewed_at, nowMs),
  }
}

/** D1 + R2 implementation of the citizen-report lane. */
export const laporanStoreLayer = (db: D1Database, bucket: PhotoBucket) => {
  const ready = ensureMigrated(db).pipe(
    Effect.mapError((error) => new LaporanStoreError({ message: error.message })),
  )

  const run = <A>(sql: string, ...values: unknown[]) =>
    Effect.tryPromise({
      try: () => db.prepare(sql).bind(...values).all<A>(),
      catch: storeError,
    })

  const exec = (sql: string, ...values: unknown[]) =>
    Effect.tryPromise({
      try: () => db.prepare(sql).bind(...values).run(),
      catch: storeError,
    })

  const load = (id: string) =>
    run<DbRow>(
      "SELECT id, commodity_id, outlet, price, place_code, seen_on, alias, photo_key, status, evidence, submitted_at, reviewed_at, review_note FROM laporan_warga WHERE id = ?",
      id,
    ).pipe(Effect.map((out) => out.results[0] ?? null))

  const settlePhoto = (id: string, photoKey: string | null, step: PhotoStep) =>
    Effect.gen(function* () {
      if (step === "none" || photoKey == null) return photoKey
      if (step === "move") {
        const pending = `pending/${id}.jpg`
        if (photoKey !== pending) return null
        const object = yield* Effect.tryPromise({ try: () => bucket.get(pending), catch: storeError })
        if (object == null) return null
        const decided = `decided/${id}.jpg`
        yield* Effect.tryPromise({
          try: () => bucket.put(decided, object.body, { httpMetadata: { contentType: "image/jpeg" } }),
          catch: storeError,
        })
        yield* Effect.tryPromise({ try: () => bucket.delete(pending), catch: storeError })
        return decided
      }
      const decided = `decided/${id}.jpg`
      if (photoKey !== decided) return photoKey
      const object = yield* Effect.tryPromise({ try: () => bucket.get(decided), catch: storeError })
      if (object == null) return photoKey
      yield* Effect.tryPromise({
        try: () => bucket.put(decided, object.body, { httpMetadata: { contentType: "image/jpeg" } }),
        catch: storeError,
      })
      return decided
    })

  const submit = (body: SubmitBody, seenOn: string, submittedAt: string) =>
    Effect.gen(function* () {
      yield* ready
      const knownCommodity = COMMODITIES.some((commodity) => commodity.id === body.commodityId)
      if (!knownCommodity || placeByCode(body.placeCode) == null) {
        return yield* Effect.fail(new SubmitRejected({ message: "invalid" }))
      }
      const alias = body.alias == null ? null : body.alias.trim()
      if (alias != null && (alias.length > 40 || aliasHasUrl(alias))) {
        return yield* Effect.fail(new SubmitRejected({ message: "invalid" }))
      }
      const photoKey = body.photo ? `pending/${body.id}.jpg` : null
      const written = yield* exec(
        `INSERT OR IGNORE INTO laporan_warga (
          id, commodity_id, outlet, price, place_code, seen_on, alias, photo_key, status, evidence, submitted_at, reviewed_at, review_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL, NULL)`,
        body.id,
        body.commodityId,
        body.outlet,
        body.price,
        body.placeCode,
        seenOn,
        alias === "" ? null : alias,
        photoKey,
        submittedAt,
      )
      const row = yield* load(body.id)
      if (row == null) return yield* Effect.fail(new LaporanStoreError({ message: "missing row" }))
      return { id: row.id, created: changesOf(written) > 0, photoKey: row.photo_key }
    })

  const reports = (query: LaporanQuery, today: string, nowMs: number) =>
    Effect.gen(function* () {
      yield* ready
      const cursor = query.cursor == null ? null : yield* decodeCursor(query.cursor)
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, query.limit || LIST_PAGE_SIZE))
      const out = yield* run<DbRow>(
        `SELECT id, commodity_id, outlet, price, place_code, seen_on, alias, photo_key, status, evidence, submitted_at, reviewed_at, review_note
         FROM laporan_warga
         WHERE status = 'reviewed'
           AND outlet = ?
           AND (? IS NULL OR commodity_id = ?)
           AND (? = 0 OR (seen_on >= ? AND seen_on <= ?))
           AND (? IS NULL OR seen_on < ? OR (seen_on = ? AND id < ?))
         ORDER BY seen_on DESC, id DESC
         LIMIT ?`,
        query.outlet,
        query.commodityId,
        query.commodityId,
        query.windowOnly ? 1 : 0,
        windowStart(today),
        today,
        cursor?.primary ?? null,
        cursor?.primary ?? null,
        cursor?.primary ?? null,
        cursor?.id ?? null,
        limit + 1,
      )
      const page = out.results.slice(0, limit)
      const extra = out.results[limit]
      const rows = page.flatMap((row) => {
        const pub = toPublic(row, nowMs)
        return pub == null ? [] : [pub]
      })
      const last = page[page.length - 1]
      const nextCursor = extra != null && last != null ? encodeCursor(last.seen_on, last.id) : null
      const resumeCursor = last != null ? encodeCursor(last.seen_on, last.id) : null
      return { rows, nextCursor, resumeCursor }
    })

  const pending = () =>
    Effect.gen(function* () {
      yield* ready
      const out = yield* run<QueueRow>(
        `SELECT l.id, l.commodity_id, l.outlet, l.price, l.place_code, l.seen_on, l.alias, l.photo_key, l.status,
                l.evidence, l.submitted_at, l.reviewed_at, l.review_note, p.price AS pihps_price
         FROM laporan_warga l
         LEFT JOIN prices_daily p
           ON p.date = l.seen_on
          AND p.commodity_id = l.commodity_id
          AND p.region_code = substr(l.place_code, 1, 2)
          AND p.level = 'eceran'
          AND p.source_id = 'pihps'
          AND p.price IS NOT NULL
         WHERE l.status = 'pending'
         ORDER BY l.submitted_at ASC, l.id ASC`,
      )
      return out.results.flatMap((row) => {
        const admin = toAdmin(row, 0, row.pihps_price)
        if (admin == null || admin.status !== "pending") return []
        const item: AdminPending = {
          id: admin.id,
          commodityId: admin.commodityId,
          outlet: admin.outlet,
          price: admin.price,
          placeCode: admin.placeCode,
          seenOn: admin.seenOn,
          alias: admin.alias,
          submittedAt: admin.submittedAt,
          photoKey: admin.photoKey,
          pihpsPrice: admin.pihpsPrice,
        }
        return [item]
      })
    })

  const reviewedPage = (cursor: string | null, nowMs: number) =>
    Effect.gen(function* () {
      yield* ready
      const decoded = cursor == null ? null : yield* decodeCursor(cursor)
      const out = yield* run<DbRow>(
        `SELECT id, commodity_id, outlet, price, place_code, seen_on, alias, photo_key, status, evidence, submitted_at, reviewed_at, review_note
         FROM laporan_warga
         WHERE status = 'reviewed'
           AND (? IS NULL OR reviewed_at < ? OR (reviewed_at = ? AND id < ?))
         ORDER BY reviewed_at DESC, id DESC
         LIMIT ?`,
        decoded?.primary ?? null,
        decoded?.primary ?? null,
        decoded?.primary ?? null,
        decoded?.id ?? null,
        LIST_PAGE_SIZE + 1,
      )
      const page = out.results.slice(0, LIST_PAGE_SIZE)
      const extra = out.results[LIST_PAGE_SIZE]
      const rows = page.flatMap((row) => {
        const admin = toAdmin(row, nowMs, null)
        return admin == null ? [] : [admin]
      })
      const last = page[page.length - 1]
      const nextCursor =
        extra != null && last != null && last.reviewed_at != null ? encodeCursor(last.reviewed_at, last.id) : null
      return { rows, nextCursor }
    })

  const decide = (body: DecideBody, nowIso: string, nowMs: number) =>
    Effect.gen(function* () {
      yield* ready
      const current = yield* load(body.id)
      if (current == null) return yield* Effect.fail(new ReportMissing())
      const status = asStatus(current.status)
      if (status == null) return yield* Effect.fail(new LaporanStoreError({ message: "status" }))
      const plan = planDecision(status, asEvidence(current.evidence), body)
      if (plan.kind === "conflict") return yield* Effect.fail(new DecisionConflict())
      if (plan.kind === "noop") {
        const row = toAdmin(current, nowMs, null)
        if (row == null) return yield* Effect.fail(new LaporanStoreError({ message: "row" }))
        return { changed: false, row }
      }
      const photoKey = yield* settlePhoto(current.id, current.photo_key, current.photo_key == null ? "none" : plan.photo)
      const written = yield* exec(
        `UPDATE laporan_warga
         SET status = ?, evidence = ?, review_note = ?, reviewed_at = ?, photo_key = ?
         WHERE id = ? AND status = ?`,
        plan.status,
        plan.evidence,
        plan.note,
        nowIso,
        photoKey,
        current.id,
        status,
      )
      if (changesOf(written) === 0) return yield* Effect.fail(new DecisionConflict())
      const next = yield* load(current.id)
      if (next == null) return yield* Effect.fail(new LaporanStoreError({ message: "missing row" }))
      const row = toAdmin(next, nowMs, null)
      if (row == null) return yield* Effect.fail(new LaporanStoreError({ message: "row" }))
      return { changed: true, row }
    })

  const readPhoto = (id: string, mode: "public" | "admin") =>
    Effect.gen(function* () {
      yield* ready
      const row = yield* load(id)
      const photoKey = row?.photo_key
      if (row == null || photoKey == null) return null
      const pending = `pending/${id}.jpg`
      const decided = `decided/${id}.jpg`
      if (mode === "public") {
        if (row.status !== "reviewed" || photoKey !== decided) return null
      } else if (photoKey !== pending && photoKey !== decided) {
        return null
      }
      return yield* Effect.tryPromise({ try: () => bucket.get(photoKey), catch: storeError })
    })

  return Layer.succeed(LaporanStore, {
    submit,
    reports,
    pending,
    reviewedPage,
    decide,
    publicPhoto: (id) => readPhoto(id, "public"),
    adminPhoto: (id) => readPhoto(id, "admin"),
  })
}
