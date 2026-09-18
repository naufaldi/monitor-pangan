import { Link, useSearch } from "@tanstack/react-router"
import { buttonClass } from "@monitor-pangan/ui"
import { parseCommoditySearch } from "#/lib/commodity-search.ts"

/** Primary route switcher between map and trend views. */
export function Navbar() {
  const raw = useSearch({ strict: false })
  const search = parseCommoditySearch(raw as Record<string, unknown>)
  return (
    <nav aria-label="Navigasi utama" className="flex gap-2">
      <Link to="/" search={search} activeOptions={{ exact: true }}>
        {({ isActive }) => <span className={buttonClass("pill", isActive)}>Peta</span>}
      </Link>
      <Link to="/tren" search={search}>
        {({ isActive }) => <span className={buttonClass("pill", isActive)}>Grafik</span>}
      </Link>
    </nav>
  )
}
