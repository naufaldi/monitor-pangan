import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, Input } from "@monitor-pangan/ui"
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
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
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
            <Button type="submit">Masuk</Button>
          </form>
        </Card>
      </main>
    )
  }
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <AdminDesk
        secret={secret}
        onReject={() => {
          clearAdminSecret()
          setSecret("")
        }}
      />
    </main>
  )
}
