import { Effect } from "effect"
import { assert, it } from "@effect/vitest"
import {
  createTurnstileLoader,
  mountTurnstile,
  type TurnstileApi,
  type TurnstileHost,
  type TurnstileRenderOptions,
  type TurnstileState,
} from "./turnstile.ts"

type FakeScript = { src: string; onLoad: () => void; onError: () => void; removed: boolean }

function fakeBrowser(options: { preloaded?: boolean } = {}) {
  const widgets = new Map<string, TurnstileRenderOptions>()
  const calls = { render: 0, reset: [] as string[], remove: [] as string[] }
  const api: TurnstileApi = {
    render: (_element, renderOptions) => {
      calls.render += 1
      const id = `w${calls.render}`
      widgets.set(id, renderOptions)
      return id
    },
    reset: (id) => {
      calls.reset.push(id)
    },
    remove: (id) => {
      calls.remove.push(id)
    },
  }
  let loaded = options.preloaded === true
  const scripts: FakeScript[] = []
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = []
  const host: TurnstileHost = {
    api: () => (loaded ? api : undefined),
    appendScript: (src, onLoad, onError) => {
      const script: FakeScript = { src, onLoad, onError, removed: false }
      scripts.push(script)
      return () => {
        script.removed = true
      }
    },
    schedule: (ms, run) => {
      const timer = { ms, run, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  }
  const scriptLoads = (script: FakeScript) => {
    loaded = true
    script.onLoad()
  }
  const liveTimers = () => timers.filter((timer) => !timer.cancelled)
  const widget = (id: string) => {
    const found = widgets.get(id)
    if (found == null) throw new Error(`no widget ${id}`)
    return found
  }
  return { host, api, calls, scripts, scriptLoads, liveTimers, widget }
}

const element = {} as HTMLElement

function mounted(browser: ReturnType<typeof fakeBrowser>, loader = createTurnstileLoader(browser.host)) {
  const states: TurnstileState[] = []
  const widget = mountTurnstile(element, "site-key", loader, (state) => states.push(state))
  const last = () => states.at(-1)?._tag
  return { widget, states, last, loader }
}

it.effect("enables submission once the challenge succeeds and hands the token out once", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    browser.scriptLoads(browser.scripts[0]!)
    browser.widget("w1").callback("token-1")
    assert.strictEqual(form.last(), "Ready")
    assert.strictEqual(form.widget.take(), "token-1")
    assert.strictEqual(form.widget.take(), null)
    assert.strictEqual(form.last(), "Spent")
  }),
)

it.effect("keeps the widget until the server attempt settles, then resets for a fresh token", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    browser.scriptLoads(browser.scripts[0]!)
    browser.widget("w1").callback("token-1")
    form.widget.take()
    assert.deepStrictEqual(browser.calls.reset, [])
    form.widget.retry()
    assert.deepStrictEqual(browser.calls.reset, [])
    assert.strictEqual(form.last(), "Spent")
    form.widget.release()
    assert.deepStrictEqual(browser.calls.reset, ["w1"])
    assert.strictEqual(form.last(), "Loading")
    browser.widget("w1").callback("token-2")
    assert.strictEqual(form.widget.take(), "token-2")
  }),
)

it.effect("never re-enables submission for a token that was already taken", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    browser.scriptLoads(browser.scripts[0]!)
    browser.widget("w1").callback("token-1")
    form.widget.take()
    browser.widget("w1").callback("token-1")
    assert.strictEqual(form.last(), "Spent")
    assert.strictEqual(form.widget.take(), null)
    form.widget.release()
    browser.widget("w1").callback("token-1")
    assert.strictEqual(form.last(), "Loading")
    assert.strictEqual(form.widget.take(), null)
    browser.widget("w1").callback("token-2")
    assert.strictEqual(form.last(), "Ready")
  }),
)

it.effect("reports a challenge failure and recovers through retry", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    browser.scriptLoads(browser.scripts[0]!)
    browser.widget("w1")["error-callback"]("300030")
    assert.deepStrictEqual(form.states.at(-1), { _tag: "Failed", cause: "challenge", code: "300030" })
    assert.strictEqual(form.widget.take(), null)
    form.widget.retry()
    assert.strictEqual(form.last(), "Loading")
    assert.deepStrictEqual(browser.calls.reset, ["w1"])
    browser.widget("w1").callback("fresh")
    assert.strictEqual(form.widget.take(), "fresh")
  }),
)

it.effect("drops an expired or timed-out token and says so", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    browser.scriptLoads(browser.scripts[0]!)
    browser.widget("w1").callback("old")
    browser.widget("w1")["expired-callback"]()
    assert.strictEqual(form.last(), "Expired")
    assert.strictEqual(form.widget.take(), null)
    browser.widget("w1").callback("again")
    browser.widget("w1")["timeout-callback"]()
    assert.strictEqual(form.last(), "Expired")
    assert.strictEqual(form.widget.take(), null)
  }),
)

it.effect("reports a blocked script and retries with a new script tag", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    browser.scripts[0]!.onError()
    assert.deepStrictEqual(form.states.at(-1), { _tag: "Failed", cause: "script" })
    assert.isTrue(browser.scripts[0]!.removed)
    form.widget.retry()
    assert.strictEqual(form.last(), "Loading")
    assert.strictEqual(browser.scripts.length, 2)
    browser.scriptLoads(browser.scripts[1]!)
    browser.widget("w1").callback("token")
    assert.strictEqual(form.last(), "Ready")
  }),
)

it.effect("bounds a script that never loads", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    const [timer] = browser.liveTimers()
    assert.isDefined(timer)
    timer!.run()
    assert.deepStrictEqual(form.states.at(-1), { _tag: "Failed", cause: "script" })
    browser.scripts[0]!.onLoad()
    assert.strictEqual(browser.calls.render, 0)

    const loaded = fakeBrowser()
    mounted(loaded)
    loaded.scriptLoads(loaded.scripts[0]!)
    assert.strictEqual(loaded.liveTimers().length, 0)
  }),
)

it.effect("ignores callbacks from a widget that was unmounted", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const form = mounted(browser)
    browser.scriptLoads(browser.scripts[0]!)
    form.widget.dispose()
    assert.deepStrictEqual(browser.calls.remove, ["w1"])
    const seen = form.states.length
    browser.widget("w1").callback("late")
    browser.widget("w1")["error-callback"]("300030")
    assert.strictEqual(form.states.length, seen)
    assert.strictEqual(form.widget.take(), null)
  }),
)

it.effect("remounting while the script loads shares one script and renders one widget", () =>
  Effect.sync(() => {
    const browser = fakeBrowser()
    const loader = createTurnstileLoader(browser.host)
    const first = mounted(browser, loader)
    first.widget.dispose()
    const second = mounted(browser, loader)
    assert.strictEqual(browser.scripts.length, 1)
    assert.isFalse(browser.scripts[0]!.removed)
    browser.scriptLoads(browser.scripts[0]!)
    assert.strictEqual(browser.calls.render, 1)
    browser.widget("w1").callback("token")
    assert.strictEqual(second.last(), "Ready")
    assert.strictEqual(first.states.length, 0)
  }),
)

it.effect("uses an already loaded Turnstile without adding a script", () =>
  Effect.sync(() => {
    const browser = fakeBrowser({ preloaded: true })
    const form = mounted(browser)
    assert.strictEqual(browser.scripts.length, 0)
    assert.strictEqual(browser.calls.render, 1)
    form.widget.dispose()
    mounted(browser)
    assert.strictEqual(browser.scripts.length, 0)
    assert.deepStrictEqual(browser.calls.remove, ["w1"])
    assert.strictEqual(browser.calls.render, 2)
  }),
)
