import { copyFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"

import { ROUTE_SEO, SITE_ORIGIN, stampRouteHtml } from "../src/seo.ts"

const shellPath = "dist/client/_shell.html"
const indexPath = "dist/client/index.html"
if (!existsSync(shellPath)) throw new Error("stamp: missing dist/client/_shell.html")
copyFileSync(shellPath, indexPath)

const index = readFileSync(indexPath, "utf8")
if (!index.includes(`<title>${ROUTE_SEO.home.title}</title>`)) {
  throw new Error("stamp: shell is missing the home title")
}

const pages = [
  ["tren", "dist/client/tren.html"],
  ["daya-beli", "dist/client/daya-beli.html"],
  ["laporan", "dist/client/laporan.html"],
  ["lapor", "dist/client/lapor.html"],
]

for (const [id, dest] of pages) {
  const html = stampRouteHtml(index, id)
  writeFileSync(dest, html)
  const dir = `dist/client/${id}`
  if (existsSync(dir)) rmSync(dir, { recursive: true })
  const head = html.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? ""
  if (!head.includes(ROUTE_SEO[id].title)) throw new Error(`${dest} missing route title`)
  if (head.includes(ROUTE_SEO.home.title)) throw new Error(`${dest} still has the home title`)
  if (!head.includes(`${SITE_ORIGIN}/${id}`)) throw new Error(`${dest} missing absolute route URL`)
  if (!head.includes(`${SITE_ORIGIN}/og.png`)) throw new Error(`${dest} missing og:image`)
}

const required = [
  "dist/client/og.png",
  "dist/client/favicon.svg",
  "dist/client/favicon.ico",
  "dist/client/favicon-16.png",
  "dist/client/favicon-32.png",
  "dist/client/apple-touch-icon.png",
  "dist/client/icon-192.png",
  "dist/client/icon-512.png",
  "dist/client/site.webmanifest",
  "dist/client/robots.txt",
  "dist/client/sitemap.xml",
]
for (const file of required) {
  if (!existsSync(file) || statSync(file).size === 0) throw new Error(`stamp: missing ${file}`)
}
