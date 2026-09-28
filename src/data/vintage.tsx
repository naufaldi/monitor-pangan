import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Effect } from "effect"
import { dataBadge, latestLiveDate } from "./provider.ts"
import { refreshFreshPrices } from "./fresh-boot.ts"

type VintageValue = {
  readonly rev: number
  readonly badge: string
}

const VintageContext = createContext<VintageValue>({ rev: 0, badge: "Memuat data…" })

/** Loads the live PIHPS date into the shell, then lets pages re-read prices. */
export function VintageProvider({ children }: { children: ReactNode }) {
  const [rev, setRev] = useState(0)
  const [badge, setBadge] = useState("Memuat data…")
  useEffect(() => {
    const sync = () => {
      setBadge(dataBadge(latestLiveDate()))
      setRev((n) => n + 1)
    }
    sync()
    void Effect.runPromise(
      refreshFreshPrices().pipe(
        Effect.catchAll(() => Effect.void),
        Effect.ensuring(Effect.sync(sync)),
      ),
    )
  }, [])
  const value = useMemo(() => ({ rev, badge }), [rev, badge])
  return <VintageContext.Provider value={value}>{children}</VintageContext.Provider>
}

/** Changes when a newer PIHPS payload has been applied. */
export function useVintage(): number {
  return useContext(VintageContext).rev
}

/** Header badge. Stays neutral until mount so prerender does not bake a stale day. */
export function useDataBadge(): string {
  return useContext(VintageContext).badge
}
