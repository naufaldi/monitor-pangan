import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { Data, Effect, Schema } from "effect"
import { Button, Card, FieldInput, FieldSelect, FileInput, StatusMessage, buttonClass } from "@monitor-pangan/ui"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { PlaceSelect } from "#/components/PlaceSelect.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { fetchTurnstileSiteKey, postReport, putPhoto, LaporanClientError } from "#/data/laporan-client.ts"
import { SAVED_COPY, SubmitBodySchema, reportFieldErrors, type Outlet, type ReportField, type ReportFieldErrors } from "#/data/laporan.ts"
import { formatRupiahAmount, parseRupiahInput } from "#/lib/format.ts"
import { downscaleToJpeg } from "#/lib/photo.ts"
import { receiptLink } from "#/data/receipt.ts"
import { browserTurnstileLoader, mountTurnstile, type TurnstileState, type TurnstileWidget } from "#/lib/turnstile.ts"

/** The check was not Ready when the report was about to be sent. */
class CheckNotReady extends Data.TaggedError("CheckNotReady")<{}> {}

const DraftSchema = SubmitBodySchema.omit("turnstileToken")
const KEEPS_INPUT = "Isian Anda tetap tersimpan."
const FIELD_ORDER: readonly ReportField[] = ["price", "place", "alias"]

type CheckNotice = { tone: "loading" | "empty" | "error"; title: string; detail?: string; retry: boolean }

function checkNotice(state: TurnstileState): CheckNotice | null {
  switch (state._tag) {
    case "Ready":
    case "Spent":
      return null
    case "Loading":
      return { tone: "loading", title: "Menyiapkan pemeriksaan kiriman…", retry: false }
    case "Interactive":
      return { tone: "empty", title: "Centang kotak pemeriksaan di atas untuk mengirim laporan.", retry: false }
    case "Unconfigured":
      return { tone: "empty", title: "Pengiriman laporan belum dibuka.", detail: "Pemeriksaan kiriman belum diaktifkan.", retry: false }
    case "Expired":
      return { tone: "error", title: "Pemeriksaan kiriman kedaluwarsa.", detail: `Ulangi pemeriksaan sebelum mengirim. ${KEEPS_INPUT}`, retry: true }
    case "Failed":
      switch (state.cause) {
        case "config":
          return { tone: "error", title: "Pemeriksaan kiriman gagal dimuat.", detail: `Server tidak terjangkau. Coba lagi. ${KEEPS_INPUT}`, retry: true }
        case "script":
          return {
            tone: "error",
            title: "Pemeriksaan kiriman gagal dimuat.",
            detail: `Periksa koneksi atau pemblokir iklan, lalu coba lagi. ${KEEPS_INPUT}`,
            retry: true,
          }
        case "challenge":
          return {
            tone: "error",
            title: "Pemeriksaan kiriman tidak lolos.",
            detail: `Coba lagi. Bila terus gagal, coba peramban atau jaringan lain. ${KEEPS_INPUT}${state.code == null ? "" : ` Kode ${state.code}.`}`,
            retry: true,
          }
        default: {
          const _exhaustive: never = state.cause
          return _exhaustive
        }
      }
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

/** Citizen report form. No account. The photo is optional and uploaded straight to R2. */
export function LaporForm() {
  const [commodityId, setCommodityId] = useState(COMMODITIES[0]?.id ?? "beras")
  const [outlet, setOutlet] = useState<Outlet>("pasar")
  const [price, setPrice] = useState<number | null>(null)
  const [placeCode, setPlaceCode] = useState("")
  const [alias, setAlias] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [siteKey, setSiteKey] = useState<string | null>(null)
  const [metaAttempt, setMetaAttempt] = useState(0)
  const [check, setCheck] = useState<TurnstileState>({ _tag: "Loading" })
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<ReportFieldErrors>({})
  // A new key mounts a fresh check after a sent report; the previous widget is disposed on success.
  const [widgetKey, setWidgetKey] = useState(0)
  const idPrefix = useId()
  const fieldId = (field: ReportField) => `${idPrefix}-${field}`
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const widget = useRef<TurnstileWidget | null>(null)
  const busy = useRef(false)
  const submissionId = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    setCheck({ _tag: "Loading" })
    void Effect.runPromise(
      fetchTurnstileSiteKey.pipe(
        Effect.match({
          onFailure: () => {
            if (live) setCheck({ _tag: "Failed", cause: "config" })
          },
          onSuccess: (key) => {
            if (!live) return
            if (key == null) setCheck({ _tag: "Unconfigured" })
            setSiteKey(key)
          },
        }),
      ),
    )
    return () => {
      live = false
    }
  }, [metaAttempt])

  useEffect(() => {
    if (siteKey == null || widgetRef.current == null) return
    const mounted = mountTurnstile(widgetRef.current, siteKey, browserTurnstileLoader, setCheck)
    widget.current = mounted
    return () => {
      mounted.dispose()
      if (widget.current === mounted) widget.current = null
    }
  }, [siteKey, widgetKey])

  const retryCheck = () => {
    if (check._tag === "Failed" && check.cause === "config") setMetaAttempt((attempt) => attempt + 1)
    else widget.current?.retry()
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setError(null)
    const parsedPrice = price ?? Number.NaN
    const aliasValue = alias.trim() === "" ? null : alias.trim()
    // Field mistakes are answered here, before a check token can be spent on a request.
    const errors = reportFieldErrors({ price, placeCode, alias: aliasValue ?? "" })
    setFieldErrors(errors)
    const firstInvalid = FIELD_ORDER.find((field) => errors[field] != null)
    if (firstInvalid != null) {
      document.getElementById(fieldId(firstInvalid))?.focus()
      return
    }
    busy.current = true
    setPending(true)
    // An uncertain network response must retry the same report rather than insert twice.
    submissionId.current ??= crypto.randomUUID()
    const raw = {
      id: submissionId.current,
      commodityId,
      outlet,
      price: parsedPrice,
      placeCode,
      alias: aliasValue,
      photo: file != null,
    }
    void Effect.runPromise(
      Effect.gen(function* () {
        const draft = yield* Schema.decodeUnknown(DraftSchema)(raw).pipe(
          Effect.mapError(() => new LaporanClientError({ status: 400 })),
        )
        const jpeg = file == null ? null : yield* downscaleToJpeg(file).pipe(Effect.mapError(() => new LaporanClientError({ status: 400 })))
        // Taken only after local checks: Siteverify spends it on any request that reaches the server.
        const turnstileToken = widget.current?.take() ?? null
        if (turnstileToken == null) return yield* Effect.fail(new CheckNotReady())
        const body = yield* Schema.decodeUnknown(SubmitBodySchema)({ ...draft, turnstileToken }).pipe(
          Effect.mapError(() => new LaporanClientError({ status: 400 })),
        )
        const saved = yield* postReport(body)
        if (jpeg != null && saved.uploadUrl != null) {
          yield* putPhoto(saved.uploadUrl, jpeg).pipe(
            Effect.match({
              onFailure: () => setPhotoFailed(true),
              onSuccess: () => setPhotoFailed(false),
            }),
          )
        } else if (jpeg != null) {
          setPhotoFailed(true)
        }
        return saved
      }).pipe(
        Effect.match({
          onFailure: (failure) => {
            widget.current?.release()
            busy.current = false
            setError(submitError(failure, file != null))
            setPending(false)
          },
          onSuccess: (saved) => {
            widget.current?.dispose()
            setSavedId(saved.id)
            setReceiptUrl(saved.receiptToken == null ? null : receiptLink(saved.id, saved.receiptToken))
            setPending(false)
          },
        }),
      ),
    )
  }

  const clearFieldError = (field: ReportField) => setFieldErrors((current) => (current[field] == null ? current : { ...current, [field]: undefined }))

  // Keeps commodity, outlet, place and alias: a second report is usually from the same market.
  const reportAnother = () => {
    submissionId.current = null
    busy.current = false
    setPrice(null)
    setFile(null)
    setPhotoFailed(false)
    setReceiptUrl(null)
    setSavedId(null)
    setCheck({ _tag: "Loading" })
    setWidgetKey((key) => key + 1)
  }

  if (savedId != null) {
    return (
      <Card padding="lg" className="flex flex-col gap-2">
        <p className="font-bold">{SAVED_COPY}</p>
        <p className="text-sm text-slate">Nomor laporan {savedId}</p>
        {receiptUrl != null ? <>
          <a className={buttonClass("rect")} href={receiptUrl} referrerPolicy="no-referrer">Lihat status laporan</a>
          <p className="text-sm text-slate">Simpan tautan status ini. Siapa pun yang memilikinya dapat melihat status laporan. Tautan tidak membuka foto, alias, atau catatan moderator.</p>
        </> : <p className="text-sm text-slate">Tautan privat hanya diberikan saat laporan pertama kali tersimpan. Tautan tidak dapat diterbitkan ulang dari nomor laporan.</p>}
        {photoFailed ? <p className="text-sm text-slate">Foto tidak terunggah. Laporan tetap menunggu tinjauan.</p> : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="rect" onClick={reportAnother}>Lapor harga lain</Button>
          <Link to="/laporan" className={buttonClass("rect", false, "inline-flex items-center")}>Lihat Laporan Warga</Link>
        </div>
      </Card>
    )
  }

  const notice = checkNotice(check)
  const unit = COMMODITIES.find((commodity) => commodity.id === commodityId)?.unit ?? "kg"

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-xl flex-col gap-4">
      <CommoditySelect commodities={COMMODITIES} value={commodityId} onChange={setCommodityId} />
      <FieldSelect
        label="Jenis tempat"
        value={outlet}
        onChange={(event) => setOutlet(event.target.value === "ritel" ? "ritel" : "pasar")}
      >
        <option value="pasar">Pasar</option>
        <option value="ritel">Ritel</option>
      </FieldSelect>
      <FieldInput
        id={fieldId("price")}
        label={`Harga per ${unit}`}
        leading="Rp"
        inputMode="numeric"
        autoComplete="off"
        value={price == null ? "" : formatRupiahAmount(price)}
        onChange={(event) => {
          setPrice(parseRupiahInput(event.target.value))
          clearFieldError("price")
        }}
        error={fieldErrors.price}
        className="tabular-nums"
      />
      <PlaceSelect
        id={fieldId("place")}
        value={placeCode}
        onChange={(code) => {
          setPlaceCode(code)
          clearFieldError("place")
        }}
        error={fieldErrors.place}
      />
      <FieldInput
        id={fieldId("alias")}
        label="Nama panggilan, boleh kosong"
        value={alias}
        maxLength={40}
        onChange={(event) => {
          setAlias(event.target.value)
          clearFieldError("alias")
        }}
        error={fieldErrors.alias}
      />
      <FileInput label="Foto, boleh kosong" accept="image/*" onFile={setFile} />
      <div ref={widgetRef} />
      {notice != null ? (
        <StatusMessage
          tone={notice.tone}
          title={notice.title}
          action={notice.retry ? <Button onClick={retryCheck} disabled={pending}>Coba lagi</Button> : null}
        >
          {notice.detail}
        </StatusMessage>
      ) : null}
      {error != null ? (
        <StatusMessage tone="error" title={error} />
      ) : null}
      {/* Stays pressable while the check runs, so field mistakes surface before the visitor waits on it. */}
      <Button type="submit" variant="primary" disabled={pending || check._tag === "Unconfigured"} aria-busy={pending || undefined}>
        {pending ? "Mengirim laporan…" : "Kirim laporan"}
      </Button>
    </form>
  )
}

function submitError(failure: LaporanClientError | CheckNotReady, withPhoto: boolean): string {
  if (failure._tag === "CheckNotReady") return "Selesaikan pemeriksaan kiriman di atas, lalu kirim lagi."
  // The Worker answers 503 only when a photo is attached and photo upload is not configured.
  if (failure.status === 503 && withPhoto) {
    return "Unggahan foto belum tersedia, jadi laporan belum terkirim. Isian dan foto tetap tersimpan; coba lagi nanti."
  }
  return "Belum dapat memastikan laporan tersimpan. Periksa isian dan coba lagi."
}
