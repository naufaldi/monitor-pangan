import { useEffect, useState } from "react"
import { Effect } from "effect"
import { Button, Card, Input, Select } from "@monitor-pangan/ui"
import { COMMODITIES } from "#/data/catalog.ts"
import {
  fetchAdminPhotoUrl,
  fetchQueue,
  fetchReviewed,
  postDecision,
  LaporanClientError,
} from "#/data/laporan-client.ts"
import {
  ADMIN_EMPTY_COPY,
  NO_PIHPS_HINT,
  outletLabel,
  type AdminPendingItem,
  type AdminReviewedItem,
  type Evidence,
} from "#/data/laporan.ts"
import { loadProvinces } from "#/data/geo.ts"
import { placeByCode } from "#/data/places.ts"
import { formatDateShort, formatPrice } from "#/lib/format.ts"

const SECRET_KEY = "mp.admin"

type AdminDeskProps = {
  secret: string
  onReject: () => void
}

const provinces = new Map(loadProvinces().map((province) => [province.code, province.name]))

/** Pending queue and the one-action decision. Holds no data until the secret is accepted. */
export function AdminDesk({ secret, onReject }: AdminDeskProps) {
  const [view, setView] = useState<"pending" | "reviewed">("pending")
  const [items, setItems] = useState<readonly AdminPendingItem[] | null>(null)
  const [reviewed, setReviewed] = useState<readonly AdminReviewedItem[]>([])
  const [reviewedCursor, setReviewedCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    void Effect.runPromise(
      fetchQueue(secret).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (failure instanceof LaporanClientError && failure.status === 401) onReject()
            else setError("Antrean tidak bisa dimuat.")
          },
          onSuccess: (queue) => {
            setItems(queue.items)
            setError(null)
          },
        }),
      ),
    )
  }

  useEffect(() => {
    reload()
  }, [secret])

  const loadReviewed = (cursor: string | null) => {
    void Effect.runPromise(
      fetchReviewed(secret, cursor).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (failure instanceof LaporanClientError && failure.status === 401) onReject()
            else setError("Daftar tinjauan tidak bisa dimuat.")
          },
          onSuccess: (page) => {
            setReviewed((current) =>
              cursor == null
                ? page.rows
                : [...current, ...page.rows.filter((row) => !current.some((item) => item.id === row.id))],
            )
            setReviewedCursor(page.nextCursor)
            setError(null)
          },
        }),
      ),
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button type="button" active={view === "pending"} onClick={() => setView("pending")}>
          Menunggu
        </Button>
        <Button
          type="button"
          active={view === "reviewed"}
          onClick={() => {
            setView("reviewed")
            loadReviewed(null)
          }}
        >
          Ditinjau
        </Button>
      </div>
      {view === "reviewed" ? (
        <ReviewedList
          rows={reviewed}
          secret={secret}
          onReject={onReject}
          onDone={() => loadReviewed(null)}
          canLoadOlder={reviewedCursor != null}
          onLoadOlder={() => loadReviewed(reviewedCursor)}
        />
      ) : null}
      {view === "pending" ? <h2 className="text-lg font-bold">Menunggu</h2> : null}
      {error != null ? <p className="text-sm text-ember">{error}</p> : null}
      {view === "pending" && items != null && items.length === 0 ? <p>{ADMIN_EMPTY_COPY}</p> : null}
      {view === "pending" ? (
        <ul className="flex flex-col gap-3">
          {(items ?? []).map((item) => (
            <li key={item.id}>
              <PendingItem item={item} secret={secret} onDone={reload} onReject={onReject} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function ReviewedList({
  rows,
  secret,
  onDone,
  onReject,
  canLoadOlder,
  onLoadOlder,
}: {
  rows: readonly AdminReviewedItem[]
  secret: string
  onDone: () => void
  onReject: () => void
  canLoadOlder: boolean
  onLoadOlder: () => void
}) {
  const [note, setNote] = useState("")
  const [active, setActive] = useState<string | null>(null)
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">Ditinjau</h2>
      {rows.length === 0 ? <p className="text-sm text-slate">Belum ada laporan yang ditinjau.</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Card padding="md" className="flex flex-col gap-2">
              <p className="font-bold">
                {COMMODITIES.find((entry) => entry.id === row.commodityId)?.name ?? row.commodityId}{" "}
                <span className="tabular-nums">
                  {formatPrice(row.price, COMMODITIES.find((entry) => entry.id === row.commodityId)?.unit ?? "kg")}
                </span>
              </p>
              <p className="text-sm">
                {outletLabel(row.outlet)} · {placeByCode(row.placeCode)?.name ?? row.placeCode}
              </p>
              {row.hasPhoto ? <AdminThumb secret={secret} id={row.id} onReject={onReject} /> : null}
              {active === row.id ? (
                <Input value={note} onChange={(event) => setNote(event.target.value)} aria-label="Catatan penarikan" />
              ) : null}
              <Button
                type="button"
                disabled={active === row.id && note.trim() === ""}
                onClick={() => {
                  if (active !== row.id) {
                    setActive(row.id)
                    setNote("")
                    return
                  }
                  void Effect.runPromise(
                    postDecision(secret, { id: row.id, action: "takedown", note: note.trim() }).pipe(
                      Effect.match({
                        onFailure: (failure) => {
                          if (failure instanceof LaporanClientError && failure.status === 401) onReject()
                        },
                        onSuccess: () => onDone(),
                      }),
                    ),
                  )
                }}
              >
                Tarik
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      {canLoadOlder ? (
        <Button type="button" onClick={onLoadOlder}>
          Muat tinjauan lebih lama
        </Button>
      ) : null}
    </section>
  )
}

function AdminThumb({ secret, id, onReject }: { secret: string; id: string; onReject: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let current: string | null = null
    void Effect.runPromise(
      fetchAdminPhotoUrl(secret, id).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (failure instanceof LaporanClientError && failure.status === 401) onReject()
          },
          onSuccess: (next) => {
            current = next
            setUrl(next)
          },
        }),
      ),
    )
    return () => {
      if (current != null) URL.revokeObjectURL(current)
    }
  }, [secret, id, onReject])
  if (url == null) return null
  return <img src={url} alt="" className="max-h-48 w-full rounded-md object-contain" />
}

function PendingItem({
  item,
  secret,
  onDone,
  onReject,
}: {
  item: AdminPendingItem
  secret: string
  onDone: () => void
  onReject: () => void
}) {
  const [evidence, setEvidence] = useState<Evidence>("none")
  const [note, setNote] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const commodity = COMMODITIES.find((entry) => entry.id === item.commodityId)
  const place = placeByCode(item.placeCode)
  const province = provinces.get(item.placeCode.slice(0, 2)) ?? ""

  useEffect(() => {
    if (item.photoKey == null) return
    let url: string | null = null
    void Effect.runPromise(
      fetchAdminPhotoUrl(secret, item.id).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (failure instanceof LaporanClientError && failure.status === 401) onReject()
          },
          onSuccess: (next) => {
            url = next
            setPhotoUrl(next)
          },
        }),
      ),
    )
    return () => {
      if (url != null) URL.revokeObjectURL(url)
    }
  }, [item.id, item.photoKey, secret, onReject])

  const decide = (body: Parameters<typeof postDecision>[1]) => {
    void Effect.runPromise(
      postDecision(secret, body).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (failure instanceof LaporanClientError && failure.status === 401) onReject()
          },
          onSuccess: () => onDone(),
        }),
      ),
    )
  }

  return (
    <Card padding="md" className="flex flex-col gap-2">
      <p className="font-bold">
        {commodity?.name ?? item.commodityId}{" "}
        <span className="tabular-nums">{formatPrice(item.price, commodity?.unit ?? "kg")}</span>
      </p>
      <p className="text-sm">
        {outletLabel(item.outlet)} · {place?.name ?? item.placeCode} · {province}
      </p>
      <p className="text-sm text-slate">
        {formatDateShort(item.seenOn)} · {item.alias ?? "Anonim"} · {item.submittedAt}
      </p>
      <p className="text-sm">
        {item.pihpsPrice == null
          ? NO_PIHPS_HINT
          : `Pembanding PIHPS ${formatPrice(item.pihpsPrice, commodity?.unit ?? "kg")}`}
      </p>
      {photoUrl != null ? <img src={photoUrl} alt="" className="max-h-80 w-full rounded-md object-contain" /> : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate">Bukti</span>
        <Select value={evidence} onChange={(event) => setEvidence(evidenceOf(event.target.value))} aria-label="Bukti">
          <option value="receipt">Struk</option>
          <option value="board">Papan harga</option>
          <option value="none">Tanpa bukti</option>
        </Select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => decide({ id: item.id, action: "approve", evidence })}>
          Terima
        </Button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate">Catatan penolakan</span>
        <Input value={note} onChange={(event) => setNote(event.target.value)} aria-label="Catatan penolakan" />
      </label>
      <Button type="button" disabled={note.trim() === ""} onClick={() => decide({ id: item.id, action: "reject", note: note.trim() })}>
        Tolak
      </Button>
    </Card>
  )
}

function evidenceOf(value: string): Evidence {
  switch (value) {
    case "receipt":
    case "board":
    case "none":
      return value
    default:
      return "none"
  }
}

export function readAdminSecret(): string {
  return sessionStorage.getItem(SECRET_KEY) ?? ""
}

export function writeAdminSecret(secret: string) {
  sessionStorage.setItem(SECRET_KEY, secret)
}

export function clearAdminSecret() {
  sessionStorage.removeItem(SECRET_KEY)
}
