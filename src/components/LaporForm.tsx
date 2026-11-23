import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { Data, Effect, Schema } from "effect"
import { Button, Card, FieldInput, FieldSelect, FileInput, StatusMessage, buttonClass } from "@monitor-pangan/ui"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { PlaceSelect } from "#/components/PlaceSelect.tsx"
import { ReportRecoveryCard } from "#/components/ReportRecoveryCard.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { fetchTurnstileSiteKey, postReport, putPhoto, LaporanClientError } from "#/data/laporan-client.ts"
import { SAVED_COPY, SubmitBodySchema, reportFieldErrors, type Outlet, type ReportField, type ReportFieldErrors } from "#/data/laporan.ts"
import { isDefiniteReject, retryBody, type ReportAttempt } from "#/data/laporan-retry.ts"
import { placeByCode } from "#/data/places.ts"
import { formatPrice, formatRupiahAmount, parseRupiahInput } from "#/lib/format.ts"
import { downscaleToJpeg } from "#/lib/photo.ts"
import { receiptLink } from "#/data/receipt.ts"
import { browserTurnstileLoader, mountTurnstile, type TurnstileState, type TurnstileWidget } from "#/lib/turnstile.ts"

/** The check was not Ready when the report was about to be sent. */
class CheckNotReady extends Data.TaggedError("CheckNotReady")<{}> {}

const DraftSchema = SubmitBodySchema.omit("turnstileToken")
/** The exact payload sent for one UUID. A retry resends this, never the current editable fields. */
type LockedAttempt = { draft: ReportAttempt; file: File | null; jpeg: Blob | null }
const KEEPS_INPUT = "Isian Anda tetap tersimpan."
const PRICE_FORMAT_ERROR = "Masukkan rupiah tanpa desimal, misalnya 12.500."
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
  const [priceText, setPriceText] = useState("")
  const price = parseRupiahInput(priceText)
  const malformedPrice = price == null && priceText.trim() !== ""
  const [placeCode, setPlaceCode] = useState("")
  const [alias, setAlias] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [siteKey, setSiteKey] = useState<string | null>(null)
  const [metaAttempt, setMetaAttempt] = useState(0)
  const [check, setCheck] = useState<TurnstileState>({ _tag: "Loading" })
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [locked, setLocked] = useState<LockedAttempt | null>(null)
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

  // Sends one captured attempt. A retry (isRetry) resends the original payload and stays locked on
  // failure; a first submit locks only on an uncertain failure, where the row may already exist.
  const sendAttempt = (attempt: LockedAttempt, isRetry: boolean) =>
    Effect.gen(function* () {
      // Taken only after local checks: Siteverify spends it on any request that reaches the server.
      const turnstileToken = widget.current?.take() ?? null
      if (turnstileToken == null) {
        widget.current?.release()
        busy.current = false
        setPending(false)
        setError(submitError(new CheckNotReady(), attempt.file != null))
        return
      }
      const result = yield* Effect.either(postReport(retryBody(attempt.draft, turnstileToken)))
      if (result._tag === "Left") {
        widget.current?.release()
        busy.current = false
        setPending(false)
        if (!isRetry && !isDefiniteReject(result.left.status)) {
          // The original may be stored. Freeze it and offer an explicit retry or a new report.
          setError(null)
          setLocked(attempt)
          setWidgetKey((key) => key + 1)
        } else {
          setError(submitError(result.left, attempt.file != null, isRetry))
        }
        return
      }
      const saved = result.right
      if (attempt.jpeg != null && saved.uploadUrl != null) {
        yield* putPhoto(saved.uploadUrl, attempt.jpeg).pipe(
          Effect.match({
            onFailure: () => setPhotoFailed(true),
            onSuccess: () => setPhotoFailed(false),
          }),
        )
      } else if (attempt.jpeg != null) {
        setPhotoFailed(true)
      }
      widget.current?.dispose()
      busy.current = false
      setSavedId(saved.id)
      setReceiptUrl(saved.receiptToken == null ? null : receiptLink(saved.id, saved.receiptToken))
      setLocked(null)
      setPending(false)
    })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setError(null)
    const parsedPrice = price ?? Number.NaN
    const aliasValue = alias.trim() === "" ? null : alias.trim()
    // Field mistakes are answered here, before a check token can be spent on a request.
    const errors = reportFieldErrors({ price, placeCode, alias: aliasValue ?? "" })
    if (malformedPrice) errors.price = PRICE_FORMAT_ERROR
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
        yield* sendAttempt({ draft, file, jpeg }, false)
      }).pipe(
        // Only the local decode/downscale can fail here; sendAttempt settles its own failures.
        Effect.catchAll((failure: LaporanClientError) =>
          Effect.sync(() => {
            widget.current?.release()
            busy.current = false
            setPending(false)
            setError(submitError(failure, file != null))
          }),
        ),
      ),
    )
  }

  const retryOriginal = () => {
    if (busy.current || locked == null) return
    busy.current = true
    setPending(true)
    setError(null)
    void Effect.runPromise(sendAttempt(locked, true))
  }

  // Explicit new report: a fresh UUID on the next send. The visitor's edits stay in the field state,
  // so nothing they typed is lost; the previous attempt may already be stored under its own UUID.
  const startNewReport = () => {
    if (busy.current) return
    submissionId.current = null
    busy.current = false
    setLocked(null)
    setError(null)
    setPhotoFailed(false)
    setFieldErrors({})
    setCheck({ _tag: "Loading" })
    setWidgetKey((key) => key + 1)
  }

  const clearFieldError = (field: ReportField) => setFieldErrors((current) => (current[field] == null ? current : { ...current, [field]: undefined }))

  // Keeps commodity, outlet, place and alias: a second report is usually from the same market.
  const reportAnother = () => {
    submissionId.current = null
    busy.current = false
    setPriceText("")
    setFile(null)
    setPhotoFailed(false)
    setReceiptUrl(null)
    setSavedId(null)
    setCheck({ _tag: "Loading" })
    setWidgetKey((key) => key + 1)
  }

  const notice = checkNotice(check)

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

  if (locked != null) {
    const commodity = COMMODITIES.find((item) => item.id === locked.draft.commodityId)
    const lockedUnit = commodity?.unit ?? "kg"
    const placeName = placeByCode(locked.draft.placeCode)?.name ?? locked.draft.placeCode
    return (
      <ReportRecoveryCard
        commodityName={commodity?.name ?? locked.draft.commodityId}
        priceLabel={formatPrice(locked.draft.price, lockedUnit)}
        placeName={placeName}
        hasPhoto={locked.draft.photo}
        pending={pending}
        error={error}
        onRetry={retryOriginal}
        onNewReport={startNewReport}
      >
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
      </ReportRecoveryCard>
    )
  }

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
        value={priceText}
        onChange={(event) => {
          setPriceText(event.target.value)
          clearFieldError("price")
        }}
        onBlur={() => {
          if (price != null) setPriceText(formatRupiahAmount(price))
          else if (malformedPrice) setFieldErrors((current) => ({ ...current, price: PRICE_FORMAT_ERROR }))
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
      <FileInput label="Foto, boleh kosong" accept="image/*" selectedFileName={file?.name ?? null} onFile={setFile} />
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

function submitError(failure: LaporanClientError | CheckNotReady, withPhoto: boolean, isRetry = false): string {
  if (failure._tag === "CheckNotReady") return "Selesaikan pemeriksaan kiriman di atas, lalu kirim lagi."
  // A rejected retry says nothing about whether the earlier uncertain attempt was saved.
  if (isRetry) {
    const reason = failure.status === 503 && withPhoto
      ? "Unggahan foto belum tersedia. Coba kirim ulang nanti, atau mulai laporan baru."
      : failure.status === 400
        ? "Pengiriman ulang ditolak. Ulangi pemeriksaan kiriman, lalu kirim ulang."
        : "Belum dapat memastikan hasil pengiriman ulang. Coba lagi."
    return `Laporan awal mungkin sudah tersimpan. ${reason}`
  }
  // The Worker answers 503 only when a photo is attached and photo upload is not configured.
  if (failure.status === 503 && withPhoto) {
    return "Unggahan foto belum tersedia, jadi laporan belum terkirim. Isian dan foto tetap tersimpan; coba lagi nanti."
  }
  // 400 is rejected before any insert, so nothing was stored. Local checks already catch field
  // mistakes before sending, so a server 400 is usually the check; ask for a retry, not new entries.
  if (failure.status === 400) return "Laporan belum terkirim. Coba lagi."
  // Uncertain: the row may exist. Editing cannot change it; the recovery card offers the next step.
  return "Belum dapat memastikan laporan tersimpan. Coba lagi."
}
