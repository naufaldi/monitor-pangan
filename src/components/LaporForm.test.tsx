import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { vi } from "vitest"
import { isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Button, FieldInput, FileInput } from "@monitor-pangan/ui"
import { PlaceSelect } from "./PlaceSelect.tsx"
import { ReportRecoveryCard } from "./ReportRecoveryCard.tsx"
import { LaporForm } from "./LaporForm.tsx"
import type { SubmitBody } from "../data/laporan.ts"

// No DOM renderer is installed. Run the real component handlers with retained hook slots.
// Effects are intentionally excluded: this proves state/prop/request wiring, not DOM or Turnstile.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
vi.mock("react", (original) => original<typeof import("react")>().then((react) => ({
  ...react,
  useId: () => "report-test",
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    const slots = hooks.slots
    if (!(index in slots)) slots[index] = initial
    return [slots[index], (value: unknown) => {
      slots[index] = typeof value === "function" ? value(slots[index]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
})))
const transport = vi.hoisted(() => ({
  sent: [] as SubmitBody[], rows: new Map<string, SubmitBody>(),
  reject: 0, lost: true, photos: [] as Blob[], converted: [] as File[],
}))
vi.mock("../data/laporan-client.ts", (original) => original<typeof import("../data/laporan-client.ts")>().then((client) => ({
  ...client,
  postReport: (body: SubmitBody) => Effect.suspend(() => {
    transport.sent.push(body)
    if (transport.reject) return Effect.fail(new client.LaporanClientError({ status: transport.reject }))
    if (!transport.rows.has(body.id)) transport.rows.set(body.id, body)
    if (transport.lost) {
      transport.lost = false
      return Effect.fail(new client.LaporanClientError({ status: 0 }))
    }
    return Effect.succeed({ id: body.id, receiptToken: null, status: "pending", uploadUrl: body.photo ? "https://fixture.invalid/photo" : null })
  }),
  putPhoto: (_url: string, blob: Blob) => Effect.sync(() => { transport.photos.push(blob) }),
})))
vi.mock("../lib/photo.ts", () => ({
  downscaleToJpeg: (file: File) => Effect.sync(() => {
    transport.converted.push(file)
    return new Blob([file.name], { type: "image/jpeg" })
  }),
}))

type Element = ReactElement<Record<string, any>>
function find(node: ReactNode, type: unknown): Element {
  const visit = (value: ReactNode): Element | undefined => {
    if (Array.isArray(value)) return value.map(visit).find(Boolean)
    if (!isValidElement<Record<string, any>>(value)) return undefined
    if (value.type === type) return value
    return visit(value.props.children)
  }
  const result = visit(node)
  assert.ok(result, `missing component ${String(type)}`)
  return result
}
const render = () => { hooks.cursor = 0; return LaporForm() }
const tasks = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock("effect", (original) => original<typeof import("effect")>().then((effect) => ({
  ...effect,
  Effect: {
    ...effect.Effect,
    runPromise: ((program, options) => {
      const task = effect.Effect.runPromise(program, options)
      tasks.push(task)
      return task
    }) as typeof effect.Effect.runPromise,
  },
})))
const settle = () => Effect.promise(() => Promise.all(tasks.splice(0)))
const setup = () => {
  hooks.slots = []
  transport.sent = []; transport.rows.clear(); transport.reject = 0; transport.lost = true
  transport.photos = []; transport.converted = []
  let tree = render()
  // Inject only the external widget port, without mounting a script or fabricating a browser.
  const widgetSlot = hooks.slots[hooks.slots.length - 3] as { current: unknown }
  let token = 0
  widgetSlot.current = { take: () => `fresh-${++token}`, release: () => {}, dispose: () => {} }
  find(tree, FieldInput).props.onChange({ target: { value: "16000" } })
  find(tree, PlaceSelect).props.onChange("3273")
  tree = render()
  return { tree }
}
const submit = (tree: ReactNode) => find(tree, "form").props.onSubmit({ preventDefault: () => {} })

for (const status of [400, 503]) it.effect(`a rejected recovery retry (${status}) preserves original uncertainty in rendered feedback`, () =>
  Effect.gen(function* () {
    const { tree } = setup()
    if (status === 503) find(tree, FileInput).props.onFile(new File(["fixture"], "photo.jpg"))
    submit(render())
    yield* settle()
    assert.strictEqual(transport.rows.size, 1, "original persisted before response loss")
    const recovery = render()
    transport.reject = status
    recovery.props.onRetry()
    yield* settle()
    const rejected = render()
    assert.strictEqual(rejected.type, ReportRecoveryCard)
    const html = renderToStaticMarkup(rejected)
    assert.ok(html.includes("Laporan awal mungkin sudah tersimpan"))
    assert.ok(!html.includes("laporan belum terkirim") && !html.includes("Laporan belum terkirim"))
    assert.strictEqual(transport.sent[1]?.id, transport.sent[0]?.id)
    assert.notStrictEqual(transport.sent[1]?.turnstileToken, transport.sent[0]?.turnstileToken)
    transport.reject = 0
    rejected.props.onRetry()
    yield* settle()
    assert.strictEqual(transport.rows.size, 1)
    assert.notStrictEqual(render().type, ReportRecoveryCard)
    assert.notStrictEqual(render().type, "form")
  }),
)

for (const action of ["retain", "remove", "replace"] as const) it.effect(`recovery → new report keeps attachment display and submitted photo consistent: ${action}`, () =>
  Effect.gen(function* () {
    const { tree } = setup()
    const original = new File(["synthetic"], "original.jpg", { type: "image/jpeg" })
    find(tree, FileInput).props.onFile(original)
    submit(render())
    yield* settle()
    render().props.onNewReport()
    let picker = find(render(), FileInput)
    // Fresh hook slots model the actual FileInput remount; its props come from LaporForm.
    const formSlots = hooks.slots
    hooks.slots = []; hooks.cursor = 0
    let input = FileInput(picker.props as Parameters<typeof FileInput>[0])
    assert.ok(renderToStaticMarkup(input).includes("original.jpg"))
    const replacement = new File(["replacement"], "replacement.jpg", { type: "image/jpeg" })
    if (action === "remove") find(input, Button).props.onClick()
    if (action === "replace") find(input, "input").props.onChange({ target: { files: [replacement], value: "fakepath" } })
    hooks.slots = formSlots
    picker = find(render(), FileInput)
    hooks.slots = []; hooks.cursor = 0
    input = FileInput(picker.props as Parameters<typeof FileInput>[0])
    assert.ok(renderToStaticMarkup(input).includes(action === "remove" ? "Belum ada foto" : action === "replace" ? "replacement.jpg" : "original.jpg"))
    hooks.slots = formSlots
    submit(render())
    yield* settle()
    assert.notStrictEqual(transport.sent[1]?.id, transport.sent[0]?.id)
    assert.strictEqual(transport.sent[1]?.photo, action !== "remove")
    assert.strictEqual(transport.converted.length, action === "remove" ? 1 : 2)
    if (action !== "remove") {
      assert.strictEqual(transport.converted[1], action === "replace" ? replacement : original)
      assert.strictEqual(yield* Effect.promise(() => transport.photos[0]!.text()), action === "replace" ? "replacement.jpg" : "original.jpg")
    }
  }),
)

for (const status of [400, 503]) it.effect(`an initial definite rejection (${status}) remains editable with definite feedback`, () =>
  Effect.gen(function* () {
    const { tree } = setup()
    transport.reject = status
    if (status === 503) find(tree, FileInput).props.onFile(new File(["fixture"], "photo.jpg"))
    submit(render())
    yield* settle()
    const rejected = render()
    assert.strictEqual(rejected.type, "form")
    assert.strictEqual(transport.rows.size, 0)
    assert.ok(renderToStaticMarkup(rejected).toLowerCase().includes("laporan belum terkirim"))
  }),
)

it.effect("FileInput keeps uncontrolled callers working and allows removal and same-file reselection", () => Effect.sync(() => {
  hooks.slots = []; hooks.cursor = 0
  let selected: File | null = null
  const props = { label: "Foto", onFile: (file: File | null) => { selected = file } }
  let picker = FileInput(props)
  const file = new File(["fixture"], "fixture.jpg")
  const target = { files: [file], value: "fakepath" }
  find(picker, "input").props.onChange({ target })
  assert.strictEqual(target.value, "")
  hooks.cursor = 0; picker = FileInput(props)
  assert.ok(renderToStaticMarkup(picker).includes(file.name))
  find(picker, "input").props.onChange({ target: { files: [], value: "" } })
  assert.strictEqual(selected, file, "cancelling replacement retains the current attachment")
  find(picker, Button).props.onClick()
  hooks.cursor = 0; picker = FileInput(props)
  assert.strictEqual(selected, null)
  assert.ok(renderToStaticMarkup(picker).includes("Belum ada foto"))
  find(picker, "input").props.onChange({ target: { files: [file], value: "fakepath" } })
  assert.strictEqual(selected, file)
}))
