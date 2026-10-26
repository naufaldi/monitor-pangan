import { useEffect, useReducer, useState } from "react"
import { createFileRoute, useRouterState } from "@tanstack/react-router"
import { PageHeader, PageShell } from "@monitor-pangan/ui"
import { Effect, Schema } from "effect"
import { ReceiptStatus, type ReceiptRequestState } from "#/components/ReceiptStatus.tsx"
import { fetchReceiptStatus } from "#/data/receipt-client.ts"
import { parseReceiptCredentials } from "#/data/receipt.ts"

export const Route = createFileRoute("/laporan-status")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Status laporan privat — Monitor Pangan" },
    { name: "robots", content: "noindex, nofollow" },
    { name: "referrer", content: "no-referrer" },
  ] }),
  validateSearch: (search: Record<string, unknown>) => ({ id: Schema.is(Schema.UUID)(search.id) ? search.id : undefined }),
  component: ReceiptPage,
})

function ReceiptPage() {
  const { id } = Route.useSearch()
  const fragment = useRouterState({ select: (state) => state.location.hash })
  const [attempt, retry] = useReducer((n: number) => n + 1, 0)
  const [state, setState] = useState<ReceiptRequestState>({ status: "loading" })
  useEffect(() => {
    const credentials = parseReceiptCredentials(id, fragment)
    if (credentials == null) { setState({ status: "denied" }); return }
    const controller = new AbortController()
    setState({ status: "loading" })
    void Effect.runPromise(fetchReceiptStatus(credentials).pipe(Effect.match({
      onFailure: (error) => { if (!controller.signal.aborted) setState(error.kind === "denied" ? { status: "denied" } : { status: "unavailable" }) },
      onSuccess: (data) => { if (!controller.signal.aborted) setState({ status: "ready", reportStatus: data.status }) },
    })), { signal: controller.signal }).catch(() => {
      if (!controller.signal.aborted) setState({ status: "unavailable" })
    })
    return () => controller.abort()
  }, [id, fragment, attempt])
  return <PageShell>
    <PageHeader title="Status laporan privat" description="Hanya status tinjauan. Bukan data PIHPS atau verifikasi resmi." />
    <ReceiptStatus state={state} retry={retry} />
  </PageShell>
}
