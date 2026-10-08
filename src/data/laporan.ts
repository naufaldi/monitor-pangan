import { Schema } from "effect"

export const OUTLETS = ["pasar", "ritel"] as const
export type Outlet = (typeof OUTLETS)[number]

export const EVIDENCES = ["receipt", "board", "none"] as const
export type Evidence = (typeof EVIDENCES)[number]

export const REPORT_STATUSES = ["pending", "reviewed", "rejected"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** One reviewed citizen report. Shares no field with a PIHPS price cell. */
export type PublicReport = {
  id: string
  commodityId: string
  outlet: Outlet
  price: number
  placeCode: string
  seenOn: string
  alias: string | null
  evidence: Evidence
  hasPhoto: boolean
}

export type ReportsPayload = {
  rows: readonly PublicReport[]
  nextCursor: string | null
  /** Cursor of the last row on this page, used to step past the window. */
  resumeCursor: string | null
}

export type LaporanQuery = {
  outlet: Outlet
  commodityId: string | null
  cursor: string | null
  windowOnly: boolean
  limit: number
}

/**
 * Read contract for citizen reports. UI and the Worker share this shape.
 * It is not `PriceDataProvider` and it never feeds `prices_daily`.
 */
export interface LaporanProvider {
  reports(query: LaporanQuery): ReportsPayload
}

export const DITINJAU_COPY =
  "Ditinjau berarti seorang moderator menilai laporan ini masuk akal. Bukan verifikasi resmi dan bukan data PIHPS."

export const EMPTY_WINDOW_COPY =
  "Belum ada laporan warga yang ditinjau dalam 30 hari terakhir."

export const NO_PIN_COPY = "Tempat tanpa pin tidak punya laporan."

export const PIN_COMMODITY_EMPTY = "Tidak ada laporan untuk komoditas ini di sini."

export const PHOTO_REMOVED_COPY = "Foto dihapus setelah 30 hari."

export const MEDIAN_CAPTION =
  "Median dari median tiap kota. Bukan rata-rata provinsi PIHPS."

export const CITY_MEDIAN_CAPTION = "Median laporan di kota ini. Bukan data PIHPS."

export const SAVED_COPY = "Laporan tersimpan dan menunggu tinjauan."

export const ADMIN_EMPTY_COPY = "Tidak ada laporan yang menunggu."

export const NO_PIHPS_HINT = "tidak ada harga PIHPS pembanding"

export const OutletSchema = Schema.Literal("pasar", "ritel")
export const EvidenceSchema = Schema.Literal("receipt", "board", "none")

export const PublicReportSchema = Schema.Struct({
  id: Schema.String,
  commodityId: Schema.String,
  outlet: OutletSchema,
  price: Schema.Number,
  placeCode: Schema.String,
  seenOn: Schema.String,
  alias: Schema.NullOr(Schema.String),
  evidence: EvidenceSchema,
  hasPhoto: Schema.Boolean,
})

export const AdminPendingSchema = Schema.Struct({
  id: Schema.String,
  commodityId: Schema.String,
  outlet: OutletSchema,
  price: Schema.Number,
  placeCode: Schema.String,
  seenOn: Schema.String,
  alias: Schema.NullOr(Schema.String),
  submittedAt: Schema.String,
  photoKey: Schema.NullOr(Schema.String),
  pihpsPrice: Schema.NullOr(Schema.Number),
})

export const AdminQueueSchema = Schema.Struct({
  items: Schema.Array(AdminPendingSchema),
})

export type AdminPendingItem = typeof AdminPendingSchema.Type

export const AdminReviewedSchema = Schema.Struct({
  id: Schema.String,
  commodityId: Schema.String,
  outlet: OutletSchema,
  price: Schema.Number,
  placeCode: Schema.String,
  seenOn: Schema.String,
  alias: Schema.NullOr(Schema.String),
  evidence: Schema.NullOr(EvidenceSchema),
  reviewNote: Schema.NullOr(Schema.String),
  reviewedAt: Schema.NullOr(Schema.String),
  hasPhoto: Schema.Boolean,
})

export const AdminReviewedPageSchema = Schema.Struct({
  rows: Schema.Array(AdminReviewedSchema),
  nextCursor: Schema.NullOr(Schema.String),
})

export type AdminReviewedItem = typeof AdminReviewedSchema.Type

export const ReportsPayloadSchema = Schema.Struct({
  rows: Schema.Array(PublicReportSchema),
  nextCursor: Schema.NullOr(Schema.String),
  resumeCursor: Schema.NullOr(Schema.String),
})

export const SubmitBodySchema = Schema.Struct({
  id: Schema.UUID,
  commodityId: Schema.String,
  outlet: OutletSchema,
  price: Schema.Int.pipe(Schema.between(100, 1_000_000)),
  placeCode: Schema.String.pipe(Schema.pattern(/^\d{4}$/)),
  alias: Schema.NullOr(Schema.String.pipe(Schema.maxLength(40))),
  photo: Schema.Boolean,
  turnstileToken: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2048)),
})

export type SubmitBody = typeof SubmitBodySchema.Type

export const DecideBodySchema = Schema.Union(
  Schema.Struct({
    id: Schema.UUID,
    action: Schema.Literal("approve"),
    evidence: EvidenceSchema,
  }),
  Schema.Struct({
    id: Schema.UUID,
    action: Schema.Literal("reject"),
    note: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(500)),
  }),
  Schema.Struct({
    id: Schema.UUID,
    action: Schema.Literal("takedown"),
    note: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(500)),
  }),
)

export type DecideBody = typeof DecideBodySchema.Type

const URL_LIKE = /https?:\/\/|www\./i

/** Alias text that would publish a link. */
export function aliasHasUrl(alias: string): boolean {
  return URL_LIKE.test(alias)
}

/** The outlet the map is not showing. Province medians still read both. */
export function otherOutlet(outlet: Outlet): Outlet {
  switch (outlet) {
    case "pasar":
      return "ritel"
    case "ritel":
      return "pasar"
    default: {
      const _exhaustive: never = outlet
      return _exhaustive
    }
  }
}

/** Visible outlet name. Pasar and ritel stay separate labels. */
export function outletLabel(outlet: Outlet): string {
  switch (outlet) {
    case "pasar":
      return "Pasar"
    case "ritel":
      return "Ritel"
    default: {
      const _exhaustive: never = outlet
      return _exhaustive
    }
  }
}

/** Visible evidence name set by the moderator. */
export function evidenceLabel(evidence: Evidence): string {
  switch (evidence) {
    case "receipt":
      return "Struk"
    case "board":
      return "Papan harga"
    case "none":
      return "Tanpa bukti"
    default: {
      const _exhaustive: never = evidence
      return _exhaustive
    }
  }
}

/** Floor sentence for one outlet. The other outlet is not included in the counts. */
export function floorCopy(cityCount: number, reportCount: number): string {
  return `Belum cukup kota (${cityCount} kota, ${reportCount} laporan).`
}

/** Count line under a province median. */
export function medianStatsCopy(cityCount: number, reportCount: number): string {
  return `Median ${cityCount} kota, ${reportCount} laporan, 30 hari terakhir.`
}

/** Named ends of the city-median range. */
export function medianRangeCopy(lowName: string, lowPrice: string, highName: string, highPrice: string): string {
  return `${lowPrice} di ${lowName} sampai ${highPrice} di ${highName}.`
}
