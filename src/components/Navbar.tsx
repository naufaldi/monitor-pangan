import type { FocusEvent } from "react"
import { Link, useRouterState, useSearch } from "@tanstack/react-router"
import { navPillClass } from "@monitor-pangan/ui"
import { parseCommoditySearch, parseOverviewSearch, parseProvinceSearch, parseTrendSearch } from "#/lib/commodity-search.ts"

// A pill marks the route, not its filters: date, province or commodity params never clear it.
const linkProps = {
  activeOptions: { includeSearch: false },
  activeProps: { className: navPillClass(true) },
  inactiveProps: { className: navPillClass(false) },
  onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
    event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
  },
}

/** The link owns the pill so its hit area matches the visible control. */
export function Navbar() {
  const raw = useSearch({ strict: false })
  const search = parseProvinceSearch(raw as Record<string, unknown>)
  // The report form and its private status page belong to Laporan Warga, though they are separate routes.
  const inReports = useRouterState({ select: (state) => state.location.pathname === "/lapor" || state.location.pathname === "/laporan-status" })
  return (
    <nav aria-label="Navigasi utama" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
      <Link to="/" search={search} {...linkProps} activeOptions={{ exact: true, includeSearch: false }}>
        Peta
      </Link>
      <Link to="/tren" search={parseTrendSearch(raw as Record<string, unknown>)} {...linkProps}>
        Grafik
      </Link>
      <Link to="/provinsi" search={parseOverviewSearch(raw as Record<string, unknown>)} {...linkProps}>
        Provinsi
      </Link>
      <Link to="/daya-beli" search={parseCommoditySearch(raw as Record<string, unknown>)} {...linkProps}>
        Daya Beli
      </Link>
      <Link to="/keranjang" search={search.provinsi == null ? {} : { provinsi: search.provinsi }} {...linkProps}>
        Keranjang
      </Link>
      <Link
        to="/laporan"
        {...linkProps}
        inactiveProps={inReports ? { className: navPillClass(true), "aria-current": "true" } : linkProps.inactiveProps}
      >
        Laporan Warga
      </Link>
    </nav>
  )
}
