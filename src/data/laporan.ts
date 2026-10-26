import { Schema } from "effect"

export const OUTLETS = ["pasar", "ritel"] as const
export type Outlet = (typeof OUTLETS)[number]

export const EVIDENCES = ["receipt", "board", "none"] as const
export type Evidence = (typeof EVIDENCES)[number]

export const REPORT_STATUSES = ["pending", "reviewed", "rejected"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const ReceiptTokenSchema = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/))
export const ReceiptStatusSchema = Schema.Struct({ status: Schema.Literal(...REPORT_STATUSES) })
export type ReceiptStatus = typeof ReceiptStatusSchema.Type

/** Optional receipt keeps older Worker responses and callers compatible. */
export const SubmitResponseSchema = Schema.Struct({
  id: Schema.UUID,
  uploadUrl: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
  receiptToken: Schema.optionalWith(Schema.NullOr(ReceiptTokenSchema), { default: () => null }),
})

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

export const REPORT_PRICE_MIN = 100
export const REPORT_PRICE_MAX = 1_000_000
const PLACE_CODE = /^\d{4}$/

export const SubmitBodySchema = Schema.Struct({
  id: Schema.UUID,
  commodityId: Schema.String,
  outlet: OutletSchema,
  price: Schema.Int.pipe(Schema.between(REPORT_PRICE_MIN, REPORT_PRICE_MAX)),
  placeCode: Schema.String.pipe(Schema.pattern(PLACE_CODE)),
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

export type ReportField = "price" | "place" | "alias"
export type ReportFieldErrors = Partial<Record<ReportField, string>>

/** Field messages the visitor can fix before a check token is spent. Same bounds as SubmitBodySchema. */
export function reportFieldErrors(input: { price: number | null; placeCode: string; alias: string }): ReportFieldErrors {
  const errors: ReportFieldErrors = {}
  if (input.price == null) errors.price = "Isi harga yang Anda lihat."
  else if (!Number.isInteger(input.price) || input.price < REPORT_PRICE_MIN || input.price > REPORT_PRICE_MAX) {
    errors.price = "Harga harus antara Rp 100 dan Rp 1.000.000."
  }
  if (!PLACE_CODE.test(input.placeCode)) errors.place = "Pilih kota atau kabupaten."
  if (aliasHasUrl(input.alias)) errors.alias = "Nama panggilan tidak boleh berisi tautan."
  return errors
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
