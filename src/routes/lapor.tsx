import { createFileRoute } from "@tanstack/react-router"
import { LaporForm } from "#/components/LaporForm.tsx"
import { seoLinks, seoMeta, seoScripts } from "#/seo.ts"

export const Route = createFileRoute("/lapor")({
  ssr: false,
  head: () => ({
    meta: seoMeta("lapor"),
    links: seoLinks("lapor"),
    scripts: seoScripts("lapor"),
  }),
  component: LaporPage,
})

function LaporPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header>
        <h2 className="text-lg font-bold">Lapor harga</h2>
        <p className="text-sm text-slate">
          Satu harga yang Anda lihat. Laporan menunggu tinjauan dan bukan data PIHPS.
        </p>
      </header>
      <LaporForm />
    </main>
  )
}
