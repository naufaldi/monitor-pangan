import type { FocusEvent } from "react"
import { Link, useSearch } from "@tanstack/react-router"
import { navPillClass } from "@monitor-pangan/ui"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"

const linkProps = {
  activeProps: { className: navPillClass(true) },
  inactiveProps: { className: navPillClass(false) },
  onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
    event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
  },
}

/** The link owns the pill so its hit area matches the visible control. */
export function Navbar() {
  const raw = useSearch({ strict: false })
  const search = parseCommoditySearch(raw as Record<string, unknown>)
  return (
    <nav aria-label="Navigasi utama" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
      <Link to="/" search={search} activeOptions={{ exact: true }} {...linkProps}>
        Peta
      </Link>
      <Link to="/tren" search={search} {...linkProps}>
        Grafik
      </Link>
      <Link to="/daya-beli" search={search} {...linkProps}>
        Daya Beli
      </Link>
      <Link to="/laporan" activeOptions={{ includeSearch: false }} {...linkProps}>
        Laporan Warga
      </Link>
    </nav>
  )
}
