import { useMemo } from "react"
import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router"
import { Badge } from "@monitor-pangan/ui"
import { Navbar } from "../components/Navbar.tsx"
import { dataBadge, latestLiveDate, provider } from "../data/provider.ts"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Monitor Pangan — Harga Pangan Indonesia" },
      {
        name: "description",
        content: "Peta dan tabel harga pangan strategis Indonesia per provinsi.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
})

function RootComponent() {
  const latest = latestLiveDate()
  const dates = useMemo(() => provider.dates(), [])
  const search = useRouterState({ select: (s) => s.location.search })
  const rawTanggal = (search as Record<string, unknown>).tanggal
  const tanggal = typeof rawTanggal === "string" && dates.includes(rawTanggal) ? rawTanggal : null
  const badgeDate = tanggal ?? latest
  return (
    <div className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-hairline bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Monitor Pangan</h1>
            <p className="text-sm text-slate">
              Harga pangan strategis Indonesia per provinsi
            </p>
          </div>
          <Badge tone="ember" className="ml-auto">
            {dataBadge(badgeDate)}
          </Badge>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pb-4">
          <Navbar />
        </div>
      </header>
      <Outlet />
    </div>
  )
}

function NotFoundPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-4">
      <p className="text-sm text-slate">Halaman tidak ditemukan.</p>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
