import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router"
import { Badge } from "@monitor-pangan/ui"
import { Navbar } from "../components/Navbar.tsx"
import { useDataBadge, useVintage, VintageProvider } from "../data/vintage.tsx"
import { dataBadgeTone, latestLiveDate, provider } from "../data/provider.ts"
import { homeSelectedDate, parseHomeSearch } from "../lib/commodity-search.ts"
import { seoLinks, seoMeta, seoScripts, THEME_COLOR } from "../seo.ts"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: THEME_COLOR },
      ...seoMeta("home"),
    ],
    links: [{ rel: "stylesheet", href: appCss }, ...seoLinks("home")],
    scripts: seoScripts("home"),
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
})

function RootComponent() {
  return (
    <VintageProvider>
      <Shell />
    </VintageProvider>
  )
}

function Shell() {
  useVintage()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const search = useRouterState({ select: (state) => state.location.search })
  const dates = provider.dates()
  const homeDate = pathname === "/" ? homeSelectedDate(parseHomeSearch(search, dates), dates, latestLiveDate()) : undefined
  const badge = useDataBadge(homeDate)
  const pihpsBadge = !/^\/(laporan|lapor|admin)\/?$/.test(pathname)
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
          {pihpsBadge ? (
            <Badge tone={dataBadgeTone(badge)} className="ml-auto">
              {badge}
            </Badge>
          ) : null}
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
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
