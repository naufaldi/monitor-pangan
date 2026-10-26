import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Effect } from "effect"
import { todayInJakarta } from "#/lib/jakarta-today.ts"
import { dataBadge, latestLiveDate, pageSourceNote } from "./provider.ts"
import { refreshFreshPrices } from "./fresh-boot.ts"
import { fetchPihpsHealth } from "./health-client.ts"
import type { PihpsHealth } from "./health-schema.ts"

export type FreshnessState = {
  readonly status: "idle" | "loading" | "ready"
  readonly refreshFailed: boolean
  readonly healthFailed: boolean
  readonly health: PihpsHealth | null
}

type VintageValue = {
  readonly rev: number
  readonly badge: string
  readonly today: string | null
  readonly freshness: FreshnessState
  readonly retry: () => void
}

const VintageContext = createContext<VintageValue>({
  rev: 0,
  badge: "Memuat data…",
  today: null,
  freshness: { status: "idle", refreshFailed: false, healthFailed: false, health: null },
  retry: () => {},
})

/** Loads the live PIHPS date into the shell, then lets pages re-read prices. */
export function VintageProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [rev, setRev] = useState(0)
  const [badge, setBadge] = useState("Memuat data…")
  const [today, setToday] = useState<string | null>(null)
  const [freshness, setFreshness] = useState<FreshnessState>({ status: "idle", refreshFailed: false, healthFailed: false, health: null })
  const attempted = useRef(false)
  const busy = useRef(false)
  const retry = useCallback(() => {
    if (!enabled || busy.current) return
    busy.current = true
    attempted.current = true
    setFreshness((previous) => ({ ...previous, status: "loading" }))
    void Effect.runPromise(Effect.all({
      prices: Effect.either(refreshFreshPrices()),
      health: Effect.either(fetchPihpsHealth()),
    }, { concurrency: 2 }).pipe(Effect.tap(({ prices, health }) => Effect.sync(() => {
      setBadge(dataBadge(latestLiveDate()))
      setRev((n) => n + 1)
      setFreshness((previous) => ({
        status: "ready", refreshFailed: prices._tag === "Left", healthFailed: health._tag === "Left",
        health: health._tag === "Right" ? health.right : previous.health,
      }))
    })), Effect.ensuring(Effect.sync(() => { busy.current = false }))))
  }, [enabled])
  useEffect(() => {
    setBadge(dataBadge(latestLiveDate()))
    void Effect.runPromise(
      todayInJakarta().pipe(
        Effect.tap((day) => Effect.sync(() => setToday(day))),
      ),
    )
  }, [])
  useEffect(() => {
    if (enabled && !attempted.current) retry()
  }, [enabled, retry])
  const value = useMemo(() => ({ rev, badge, today, freshness, retry }), [rev, badge, today, freshness, retry])
  return <VintageContext.Provider value={value}>{children}</VintageContext.Provider>
}

/** Refresh failures retain the last health evidence and the usable price overlay. */
export function usePriceFreshness() {
  const { freshness, retry } = useContext(VintageContext)
  return { freshness, retry }
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
export function useDataBadge(date?: string): string {
  const { badge } = useContext(VintageContext)
  return date == null ? badge : dataBadge(date)
}
