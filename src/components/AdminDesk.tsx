import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Effect } from "effect"
import { Button, Card, FieldSelect, Input, SectionHeader, SegmentedControl, StatusMessage } from "@monitor-pangan/ui"
import { COMMODITIES } from "#/data/catalog.ts"
import {
  fetchAdminPhotoUrl,
  fetchQueue,
  fetchReviewed,
  LaporanClientError,
} from "#/data/laporan-client.ts"
import {
  ADMIN_EMPTY_COPY,
  NO_PIHPS_HINT,
  outletLabel,
  type AdminPendingItem,
  type AdminReviewedItem,
  type DecideBody,
  type Evidence,
} from "#/data/laporan.ts"
import {
  createDecisionController,
  DECISION_FAILURE_COPY,
  type DecisionFeedback,
} from "./admin-decision.ts"
import { loadProvinces } from "#/data/geo.ts"
import { placeByCode } from "#/data/places.ts"
import { formatDateShort, formatPrice } from "#/lib/format.ts"

const SECRET_KEY = "mp.admin"

type RequestStatus = "loading" | "ready" | "error"

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
  const [pendingStatus, setPendingStatus] = useState<RequestStatus>("loading")
  const [reviewedRequest, setReviewedRequest] = useState<{ status: RequestStatus; cursor: string | null }>({ status: "loading", cursor: null })
  const pendingGen = useRef(0)
  const reviewedGen = useRef(0)
  const controller = useMemo(() => createDecisionController(), [])
  const { inflight, feedback } = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)

  const reload = () => {
    const generation = ++pendingGen.current
    setPendingStatus("loading")
    void Effect.runPromise(
      fetchQueue(secret).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (pendingGen.current !== generation) return
            if (failure instanceof LaporanClientError && failure.status === 401) onReject()
            else setPendingStatus("error")
          },
          onSuccess: (queue) => {
            if (pendingGen.current !== generation) return
            setItems(queue.items)
            setPendingStatus("ready")
          },
        }),
      ),
    )
  }

  useEffect(() => {
    reload()
    return () => {
      pendingGen.current += 1
      reviewedGen.current += 1
      controller.invalidate()
    }
  }, [secret])

  const loadReviewed = (cursor: string | null) => {
    const generation = ++reviewedGen.current
    setReviewedRequest({ status: "loading", cursor })
    void Effect.runPromise(
      fetchReviewed(secret, cursor).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (reviewedGen.current !== generation) return
            if (failure instanceof LaporanClientError && failure.status === 401) onReject()
            else setReviewedRequest({ status: "error", cursor })
          },
          onSuccess: (page) => {
            if (reviewedGen.current !== generation) return
            setReviewed((current) =>
              cursor == null
                ? page.rows
                : [...current, ...page.rows.filter((row) => !current.some((item) => item.id === row.id))],
            )
            setReviewedCursor(page.nextCursor)
            setReviewedRequest({ status: "ready", cursor })
          },
        }),
      ),
    )
  }

  const decidePending = (body: DecideBody) => {
    void Effect.runPromise(controller.decide({ secret, scope: "pending", body, onReject, reload }))
  }
  const decideReviewed = (body: DecideBody) => {
    void Effect.runPromise(controller.decide({ secret, scope: "reviewed", body, onReject, reload: () => loadReviewed(null) }))
  }

  return (
    <section className="flex flex-col gap-3">
      <SegmentedControl
        label="Tampilan"
        options={[
          { value: "pending", label: "Menunggu" },
          { value: "reviewed", label: "Ditinjau" },
        ] as const}
        value={view}
        onChange={(next) => {
          setView(next)
          if (next === "reviewed") loadReviewed(null)
        }}
      />
      {feedback != null && view === feedback.scope ? (
        <DecisionFeedbackMessage
          feedback={feedback}
          onReload={feedback.scope === "pending" ? reload : () => loadReviewed(null)}
        />
      ) : null}
      {view === "reviewed" ? (
        <>
          <ReviewedList
            rows={reviewed}
            secret={secret}
            onReject={onReject}
            onDecide={decideReviewed}
            inflight={inflight}
            showEmpty={reviewedRequest.status === "ready"}
            canLoadOlder={reviewedCursor != null && reviewedRequest.status === "ready"}
            onLoadOlder={() => loadReviewed(reviewedCursor)}
          />
          {reviewedRequest.status === "loading" ? <StatusMessage tone="loading" title="Memuat tinjauan…" /> : null}
          {reviewedRequest.status === "error" ? (
            <StatusMessage tone="error" title="Daftar tinjauan tidak bisa dimuat." action={<Button onClick={() => loadReviewed(reviewedRequest.cursor)}>Coba lagi</Button>} />
          ) : null}
        </>
      ) : null}
      {view === "pending" ? <SectionHeader title="Menunggu" /> : null}
      {view === "pending" && pendingStatus === "loading" ? <StatusMessage tone="loading" title="Memuat antrean…" /> : null}
      {view === "pending" && pendingStatus === "error" ? (
        <StatusMessage tone="error" title="Antrean tidak bisa dimuat." action={<Button onClick={reload}>Coba lagi</Button>} />
      ) : null}
      {view === "pending" && pendingStatus === "ready" && items != null && items.length === 0 ? <StatusMessage tone="empty" title={ADMIN_EMPTY_COPY} /> : null}
      {view === "pending" && pendingStatus === "ready" ? (
        <ul className="flex flex-col gap-3">
          {(items ?? []).map((item) => (
            <li key={item.id}>
              <PendingItem
                item={item}
                secret={secret}
                onReject={onReject}
                onDecide={decidePending}
                busyAction={inflight[item.id] ?? null}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** Durable decision failure alert. Rendered above the rows so it survives their removal on reload. */
export function DecisionFeedbackMessage({ feedback, onReload }: { feedback: DecisionFeedback; onReload: () => void }) {
  const copy = DECISION_FAILURE_COPY[feedback.kind]
  return (
    <StatusMessage
      tone="error"
      title={copy.title}
      action={copy.reload ? <Button type="button" onClick={onReload}>Muat ulang</Button> : undefined}
    >
      {copy.body}
    </StatusMessage>
  )
}

function ReviewedList({
  rows,
  secret,
  onDecide,
  onReject,
  inflight,
  showEmpty,
  canLoadOlder,
  onLoadOlder,
}: {
  rows: readonly AdminReviewedItem[]
  secret: string
  onDecide: (body: DecideBody) => void
  onReject: () => void
  inflight: Readonly<Record<string, DecideBody["action"]>>
  showEmpty: boolean
  canLoadOlder: boolean
  onLoadOlder: () => void
}) {
  const [note, setNote] = useState("")
  const [active, setActive] = useState<string | null>(null)
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Ditinjau" />
      {showEmpty && rows.length === 0 ? <StatusMessage tone="empty" title="Belum ada laporan yang ditinjau." /> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const busyAction = inflight[row.id] ?? null
          const busy = busyAction != null
          return (
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
                  <Input value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} aria-label="Catatan penarikan" />
                ) : null}
                <Button
                  type="button"
                  disabled={busy || (active === row.id && note.trim() === "")}
                  onClick={() => {
                    if (active !== row.id) {
                      setActive(row.id)
                      setNote("")
                      return
                    }
                    onDecide({ id: row.id, action: "takedown", note: note.trim() })
                  }}
                >
                  {busyAction === "takedown" ? "Memproses…" : "Tarik"}
                </Button>
              </Card>
            </li>
          )
        })}
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
  onReject,
  onDecide,
  busyAction,
}: {
  item: AdminPendingItem
  secret: string
  onReject: () => void
  onDecide: (body: DecideBody) => void
  busyAction: DecideBody["action"] | null
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

  const busy = busyAction != null

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
      <FieldSelect label="Bukti" value={evidence} disabled={busy} onChange={(event) => setEvidence(evidenceOf(event.target.value))}>
          <option value="receipt">Struk</option>
          <option value="board">Papan harga</option>
          <option value="none">Tanpa bukti</option>
      </FieldSelect>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={busy} onClick={() => onDecide({ id: item.id, action: "approve", evidence })}>
          {busyAction === "approve" ? "Memproses…" : "Terima"}
        </Button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate">Catatan penolakan</span>
        <Input value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} aria-label="Catatan penolakan" />
      </label>
      <Button type="button" disabled={busy || note.trim() === ""} onClick={() => onDecide({ id: item.id, action: "reject", note: note.trim() })}>
        {busyAction === "reject" ? "Memproses…" : "Tolak"}
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
