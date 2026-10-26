import { useEffect, useRef, useState, type FormEvent } from "react"
import { Effect, Schema } from "effect"
import { Button, Card, FieldSelect, FileInput, Input, StatusMessage } from "@monitor-pangan/ui"
import { CommoditySelect } from "#/components/CommoditySelect.tsx"
import { PlaceSelect } from "#/components/PlaceSelect.tsx"
import { COMMODITIES } from "#/data/catalog.ts"
import { fetchTurnstileSiteKey, postReport, putPhoto, LaporanClientError } from "#/data/laporan-client.ts"
import { SAVED_COPY, SubmitBodySchema, aliasHasUrl, type Outlet } from "#/data/laporan.ts"
import { formatRupiahAmount, parseRupiahInput } from "#/lib/format.ts"
import { downscaleToJpeg } from "#/lib/photo.ts"

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      "expired-callback": () => void
      "error-callback": () => void
    },
  ) => void
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
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    void Effect.runPromise(
      fetchTurnstileSiteKey.pipe(
        Effect.match({
          onFailure: () => setSiteKey(null),
          onSuccess: (key) => setSiteKey(key),
        }),
      ),
    )
  }, [])

  useEffect(() => {
    if (siteKey == null || widgetRef.current == null) return
    const element = widgetRef.current
    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.onload = () => {
      const turnstile = (window as Window & { turnstile?: TurnstileApi }).turnstile
      if (turnstile == null) return
      const clearToken = () => setToken("")
      turnstile.render(element, {
        sitekey: siteKey,
        callback: setToken,
        "expired-callback": clearToken,
        "error-callback": clearToken,
      })
    }
    document.body.append(script)
    return () => script.remove()
  }, [siteKey])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    setError(null)
    const parsedPrice = price ?? Number.NaN
    const aliasValue = alias.trim() === "" ? null : alias.trim()
    if (aliasValue != null && aliasHasUrl(aliasValue)) {
      setError("Alias tidak boleh berisi tautan.")
      return
    }
    busy.current = true
    setPending(true)
    const raw = {
      id: crypto.randomUUID(),
      commodityId,
      outlet,
      price: parsedPrice,
      placeCode,
      alias: aliasValue,
      photo: file != null,
      turnstileToken: token,
    }
    void Effect.runPromise(
      Effect.gen(function* () {
        const body = yield* Schema.decodeUnknown(SubmitBodySchema)(raw).pipe(
          Effect.mapError(() => new LaporanClientError({ status: 400 })),
        )
        const jpeg = file == null ? null : yield* downscaleToJpeg(file).pipe(Effect.mapError(() => new LaporanClientError({ status: 400 })))
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
        return saved.id
      }).pipe(
        Effect.match({
          onFailure: () => {
            busy.current = false
            setError("Laporan tidak tersimpan. Periksa isian dan coba lagi.")
            setPending(false)
          },
          onSuccess: (id) => {
            setSavedId(id)
            setPending(false)
          },
        }),
      ),
    )
  }

  if (savedId != null) {
    return (
      <Card padding="lg" className="flex flex-col gap-2">
        <p className="font-bold">{SAVED_COPY}</p>
        <p className="text-sm text-slate">Nomor laporan {savedId}</p>
        {photoFailed ? <p className="text-sm text-slate">Foto tidak terunggah. Laporan tetap menunggu tinjauan.</p> : null}
      </Card>
    )
  }

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
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate">Harga</span>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold">
            Rp
          </span>
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={price == null ? "" : formatRupiahAmount(price)}
            onChange={(event) => setPrice(parseRupiahInput(event.target.value))}
            aria-label="Harga"
            className="h-11 w-full py-0 pr-3 pl-10 tabular-nums"
          />
        </div>
      </label>
      <PlaceSelect value={placeCode} onChange={setPlaceCode} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate">Nama panggilan, boleh kosong</span>
        <Input value={alias} maxLength={40} onChange={(event) => setAlias(event.target.value)} aria-label="Nama panggilan" />
      </label>
      <FileInput label="Foto, boleh kosong" accept="image/*" onFile={setFile} />
      <div ref={widgetRef} />
      {siteKey == null ? <p className="text-sm text-slate">Pemeriksaan kiriman belum siap.</p> : null}
      {error != null ? (
        <StatusMessage tone="error" title={error} />
      ) : null}
      <Button type="submit" variant="primary" disabled={pending || token.length === 0}>
        Kirim laporan
      </Button>
    </form>
  )
}
