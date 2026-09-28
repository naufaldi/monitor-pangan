import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Effect } from "effect"
import { todayInJakarta } from "#/lib/jakarta-today.ts"
import { dataBadge, latestLiveDate, pageSourceNote } from "./provider.ts"
import { refreshFreshPrices } from "./fresh-boot.ts"

type VintageValue = {
  readonly rev: number
  readonly badge: string
  readonly today: string | null
}

const VintageContext = createContext<VintageValue>({
  rev: 0,
  badge: "Memuat data…",
  today: null,
})

/** Loads the live PIHPS date into the shell, then lets pages re-read prices. */
export function VintageProvider({ children }: { children: ReactNode }) {
  const [rev, setRev] = useState(0)
  const [badge, setBadge] = useState("Memuat data…")
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    const sync = () => {
      setBadge(dataBadge(latestLiveDate()))
      setRev((n) => n + 1)
    }
    sync()
    void Effect.runPromise(
      todayInJakarta().pipe(
        Effect.tap((day) => Effect.sync(() => setToday(day))),
        Effect.andThen(() => refreshFreshPrices().pipe(Effect.catchAll(() => Effect.void))),
        Effect.ensuring(Effect.sync(sync)),
      ),
    )
  }, [])
  const value = useMemo(() => ({ rev, badge, today }), [rev, badge, today])
  return <VintageContext.Provider value={value}>{children}</VintageContext.Provider>
}

/** Footer copy. Until Clock resolves, do not claim the price is not from today. */
export function usePageSourceNote(date: string): string {
  const today = useContext(VintageContext).today
  return pageSourceNote(date, today ?? date)
}

/** Changes when a newer PIHPS payload has been applied. */
export function useVintage(): number {
  return useContext(VintageContext).rev
}

/** Header badge. Stays neutral until mount so prerender does not bake a stale day. */
export function useDataBadge(): string {
  return useContext(VintageContext).badge
}
