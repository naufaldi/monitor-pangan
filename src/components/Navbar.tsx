import { Link } from "@tanstack/react-router"
import { buttonClass } from "@monitor-pangan/ui"

/** Primary route switcher between map and trend views. */
export function Navbar() {
  return (
    <nav aria-label="Navigasi utama" className="flex gap-2">
      <Link to="/" activeOptions={{ exact: true }}>
        {({ isActive }) => <span className={buttonClass("pill", isActive)}>Peta</span>}
      </Link>
      <Link to="/tren">
        {({ isActive }) => <span className={buttonClass("pill", isActive)}>Grafik</span>}
      </Link>
    </nav>
  )
}
