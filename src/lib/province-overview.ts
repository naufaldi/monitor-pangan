import { Effect } from "effect"
import { COMMODITIES, type Commodity } from "#/data/catalog.ts"
import { fetchSnapshot, PriceFetchError } from "#/data/api-client.ts"
import { isSnapshotLoaded, provider, type Snapshot } from "#/data/provider.ts"

export type SnapshotReading =
  | { status: "loading" }
  | { status: "ready"; snapshot: Snapshot }
  | { status: "error"; kind: PriceFetchError["kind"] }

export type ProvinceOverview = {
  date: string
  previousDate: string | null
  entries: { commodity: Commodity; current: SnapshotReading; previous: SnapshotReading | null }[]
}

export type OverviewReader = {
  cached: (date: string, commodityId: string) => Snapshot | null
  load: (date: string, commodityId: string) => Effect.Effect<Snapshot, PriceFetchError>
}

const matches = (snapshot: Snapshot, date: string, commodityId: string) => snapshot.date === date && snapshot.commodity.id === commodityId
const observed = (price: number | null | undefined) => price != null && Number.isFinite(price) && price > 0 ? price : null

/** An exact date is required; a cache entry from a prior date is never substituted. */
export function cachedOverview(date: string, previousDate: string | null, reader: OverviewReader, commodities: readonly Commodity[] = COMMODITIES): ProvinceOverview {
  const reading = (day: string, id: string): SnapshotReading => {
    const snapshot = reader.cached(day, id)
    return snapshot != null && matches(snapshot, day, id) ? { status: "ready", snapshot } : { status: "loading" }
  }
  return { date, previousDate, entries: commodities.map((commodity) => ({
    commodity, current: reading(date, commodity.id), previous: previousDate == null ? null : reading(previousDate, commodity.id),
  })) }
}

/** At most 20 snapshot reads, at most three in flight, with failures kept per cell. */
export const loadProvinceOverview = Effect.fn("ProvinceOverview.load")(function* (
  date: string, previousDate: string | null, reader: OverviewReader, commodities: readonly Commodity[] = COMMODITIES,
) {
  const initial = cachedOverview(date, previousDate, reader, commodities)
  const tasks = initial.entries.flatMap((entry) => [
    ...(entry.current.status === "loading" ? [{ id: entry.commodity.id, date }] : []),
    ...(previousDate != null && entry.previous?.status === "loading" ? [{ id: entry.commodity.id, date: previousDate }] : []),
  ])
  const results = yield* Effect.forEach(tasks, (task) => reader.load(task.date, task.id).pipe(
    Effect.flatMap((snapshot) => matches(snapshot, task.date, task.id)
      ? Effect.succeed(snapshot)
      : Effect.fail(new PriceFetchError({ kind: "request", message: "Overview snapshot does not match the selected date and commodity" }))),
    Effect.match({
      onFailure: (error): SnapshotReading => ({ status: "error", kind: error.kind }),
      onSuccess: (snapshot): SnapshotReading => ({ status: "ready", snapshot }),
    }),
    Effect.map((reading) => ({ ...task, reading })),
  ), { concurrency: 3 })
  const readings = new Map(results.map((result) => [`${result.date}:${result.id}`, result.reading]))
  return { ...initial, entries: initial.entries.map((entry) => ({
    ...entry,
    current: readings.get(`${date}:${entry.commodity.id}`) ?? entry.current,
    previous: previousDate == null ? null : readings.get(`${previousDate}:${entry.commodity.id}`) ?? entry.previous,
  })) }
})

/** Province is a projection of the same snapshots, so switching it needs no new requests. */
export function provinceOverviewRows(overview: ProvinceOverview, regionCode: string) {
  return overview.entries.map((entry) => {
    const current = entry.current.status === "ready" && matches(entry.current.snapshot, overview.date, entry.commodity.id) ? entry.current.snapshot : null
    const previous = entry.previous?.status === "ready" && overview.previousDate != null && overview.previousDate < overview.date && matches(entry.previous.snapshot, overview.previousDate, entry.commodity.id) ? entry.previous.snapshot : null
    const price = observed(current?.rows.find((row) => row.regionCode === regionCode)?.price)
    const national = observed(current?.nationalAvg)
    const previousPrice = observed(previous?.rows.find((row) => row.regionCode === regionCode)?.price)
    const nationalPct = price == null || national == null ? null : ((price - national) / national) * 100
    const changePct = price == null || previousPrice == null ? null : ((price - previousPrice) / previousPrice) * 100
    return { ...entry, price, national, previousPrice,
      nationalPct: nationalPct != null && Number.isFinite(nationalPct) ? nationalPct : null,
      changePct: changePct != null && Number.isFinite(changePct) ? changePct : null,
    }
  })
}

/** Keep only a small number of remote snapshots; provider data is already bounded. */
const remoteSnapshots = new Map<string, Snapshot>()
const MAX_CACHED_SNAPSHOTS = 40

export const overviewReader: OverviewReader = {
  cached: (date, id) => isSnapshotLoaded(date, id) ? provider.snapshot(date, id) : remoteSnapshots.get(`${date}:${id}`) ?? null,
  load: (date, id) => fetchSnapshot(date, id).pipe(Effect.tap((snapshot) => Effect.sync(() => {
    remoteSnapshots.set(`${date}:${id}`, snapshot)
    if (remoteSnapshots.size > MAX_CACHED_SNAPSHOTS) remoteSnapshots.delete(remoteSnapshots.keys().next().value!)
  }))),
}
