import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, Input, PageHeader, PageShell } from "@monitor-pangan/ui"
import { AdminDesk, clearAdminSecret, readAdminSecret, writeAdminSecret } from "#/components/AdminDesk.tsx"

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tinjauan laporan" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
})

function AdminPage() {
  const [secret, setSecret] = useState(() => readAdminSecret())
  const [draft, setDraft] = useState("")
  if (secret.length === 0) {
    return (
      <PageShell className="max-w-md">
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Tinjauan laporan</h2>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              writeAdminSecret(draft)
              setSecret(draft)
            }}
          >
            <Input
              type="password"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Kunci tinjauan"
              autoComplete="current-password"
            />
            <Button type="submit" variant="primary">Masuk</Button>
          </form>
        </Card>
      </PageShell>
    )
  }
  return (
    <PageShell>
      <PageHeader title="Tinjauan laporan" />
      <AdminDesk
        secret={secret}
        onReject={() => {
          clearAdminSecret()
          setSecret("")
        }}
      />
    </PageShell>
  )
}
