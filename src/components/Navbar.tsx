import { Link } from "@tanstack/react-router"

import { cn } from "#/lib/utils.ts"

function tabClass(active: boolean): string {
  return cn(
    "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-transform active:scale-[0.96]",
    active
      ? "border-ink bg-ink text-white"
      : "border-hairline bg-paper text-ink",
  )
}

/** Primary route switcher between map and trend views. */
export function Navbar() {
  return (
    <nav aria-label="Navigasi utama" className="flex gap-2">
      <Link to="/" activeOptions={{ exact: true }}>
        {({ isActive }) => <span className={tabClass(isActive)}>Peta</span>}
      </Link>
      <Link to="/tren">
        {({ isActive }) => <span className={tabClass(isActive)}>Grafik</span>}
      </Link>
    </nav>
  )
}
