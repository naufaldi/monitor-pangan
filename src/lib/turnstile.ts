import { Effect } from "effect"

export type TurnstileRenderOptions = {
  sitekey: string
  callback: (token: string) => void
  "expired-callback": () => void
  "error-callback": (code: string) => void
  "timeout-callback": () => void
}

export type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string | null | undefined
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

/** The browser pieces the loader touches, injected so the lifecycle runs without a DOM. */
export type TurnstileHost = {
  api: () => TurnstileApi | undefined
  /** Appends a script tag and returns a function that removes it. */
  appendScript: (src: string, onLoad: () => void, onError: () => void) => () => void
  schedule: (ms: number, run: () => void) => () => void
}

/** One owner for the check. Only `Ready` holds a token, and the widget keeps it private. */
export type TurnstileState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Unconfigured" }
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Spent" }
  | { readonly _tag: "Expired" }
  | { readonly _tag: "Failed"; readonly cause: "config" | "script" | "challenge"; readonly code?: string }

export type TurnstileLoader = {
  load: (onReady: (api: TurnstileApi) => void, onFail: () => void) => () => void
}

export type TurnstileWidget = {
  retry: () => void
  /** Hands out the current token once. The widget stays Spent until the attempt settles. */
  take: () => string | null
  /** After an unsuccessful attempt: Siteverify may have spent the token, so ask for a fresh one. */
  release: () => void
  dispose: () => void
}

export const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const LOAD_TIMEOUT_MS = 15_000

/** Shares one api.js across mounts. A failed or stalled tag is dropped so the next load fetches again. */
export const createTurnstileLoader = (host: TurnstileHost): TurnstileLoader => {
  type Waiter = { onReady: (api: TurnstileApi) => void; onFail: () => void }
  const waiters = new Set<Waiter>()
  let pending: { remove: () => void; cancelTimer: () => void } | null = null

  const settle = (attempt: NonNullable<typeof pending>, api: TurnstileApi | undefined) => {
    if (attempt !== pending) return
    pending = null
    attempt.cancelTimer()
    if (api == null) attempt.remove()
    const settled = [...waiters]
    waiters.clear()
    for (const waiter of settled) {
      if (api == null) waiter.onFail()
      else waiter.onReady(api)
    }
  }

  return {
    load: (onReady, onFail) => {
      const ready = host.api()
      if (ready != null) {
        onReady(ready)
        return () => {}
      }
      const waiter = { onReady, onFail }
      waiters.add(waiter)
      if (pending == null) {
        const attempt = { remove: () => {}, cancelTimer: () => {} }
        pending = attempt
        attempt.cancelTimer = host.schedule(LOAD_TIMEOUT_MS, () => settle(attempt, undefined))
        attempt.remove = host.appendScript(
          TURNSTILE_SRC,
          () => settle(attempt, host.api()),
          () => settle(attempt, undefined),
        )
      }
      return () => {
        waiters.delete(waiter)
      }
    },
  }
}

export const mountTurnstile = (
  element: HTMLElement,
  siteKey: string,
  loader: TurnstileLoader,
  onState: (state: TurnstileState) => void,
): TurnstileWidget => {
  let disposed = false
  let api: TurnstileApi | null = null
  let widgetId: string | null = null
  let token: string | null = null
  const spent = new Set<string>()

  let current: TurnstileState["_tag"] = "Loading"
  // Every transition goes through here, so a removed widget's late callback cannot bring a token back.
  const emit = (state: TurnstileState, next: string | null = null) => {
    if (disposed) return
    token = next
    current = state._tag
    onState(state)
  }
  // Spent ignores the widget until release(): its callbacks still describe the token in flight.
  const fromWidget = (state: TurnstileState, next: string | null = null) => {
    if (current === "Spent" || (next != null && spent.has(next))) return
    emit(state, next)
  }
  const failScript = () => emit({ _tag: "Failed", cause: "script" })

  const render = (loaded: TurnstileApi) => {
    if (disposed) return
    api = loaded
    const id = Effect.runSync(
      Effect.try(() =>
        loaded.render(element, {
          sitekey: siteKey,
          callback: (next) => fromWidget({ _tag: "Ready" }, next),
          "expired-callback": () => fromWidget({ _tag: "Expired" }),
          "timeout-callback": () => fromWidget({ _tag: "Expired" }),
          "error-callback": (code) => fromWidget({ _tag: "Failed", cause: "challenge", code }),
        }),
      ).pipe(Effect.orElseSucceed(() => null)),
    )
    if (id == null) failScript()
    else widgetId = id
  }

  let cancelLoad = loader.load(render, failScript)

  return {
    retry: () => {
      if (disposed || current === "Spent") return
      emit({ _tag: "Loading" })
      if (api != null && widgetId != null) {
        api.reset(widgetId)
        return
      }
      cancelLoad()
      cancelLoad = loader.load(render, failScript)
    },
    take: () => {
      if (disposed || token == null) return null
      const taken = token
      spent.add(taken)
      emit({ _tag: "Spent" })
      return taken
    },
    release: () => {
      if (disposed || current !== "Spent") return
      emit({ _tag: "Loading" })
      if (api != null && widgetId != null) api.reset(widgetId)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      token = null
      cancelLoad()
      if (api != null && widgetId != null) api.remove(widgetId)
      widgetId = null
    },
  }
}

export const browserTurnstileLoader = createTurnstileLoader({
  api: () => (window as Window & { turnstile?: TurnstileApi }).turnstile,
  appendScript: (src, onLoad, onError) => {
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.addEventListener("load", onLoad)
    script.addEventListener("error", onError)
    document.head.append(script)
    return () => script.remove()
  },
  schedule: (ms, run) => {
    const id = window.setTimeout(run, ms)
    return () => window.clearTimeout(id)
  },
})
