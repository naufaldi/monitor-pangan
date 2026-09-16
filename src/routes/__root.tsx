import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"

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
  return <Outlet />
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
