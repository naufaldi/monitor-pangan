import { PageHeader, PageShell } from "@monitor-pangan/ui"
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
    <PageShell>
      <PageHeader title="Lapor harga" description="Satu harga yang Anda lihat. Laporan menunggu tinjauan dan bukan data PIHPS." />
      <LaporForm />
    </PageShell>
  )
}
