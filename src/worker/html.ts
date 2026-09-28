import type { FreshPayload } from "../data/fresh-payload.ts"

/** Embed the live PIHPS payload in the HTML shell so the first client render is current. */
export function injectFreshScript(html: string, payload: FreshPayload): string {
  const json = JSON.stringify(payload).replaceAll("<", "\\u003c")
  const tag = `<script id="mp-pihps-fresh" type="application/json">${json}</script>`
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`)
  return `${tag}${html}`
}
