/** Browser chrome color. Matches `--color-canvas` in `packages/ui/src/tokens.css`. */
export const THEME_COLOR = "#f4f5f0"

export const SITE_ORIGIN = "https://monitor.naufaldi.com"

export const OG_IMAGE_PATH = "/og.png"

export const OG_IMAGE_ALT = "Cabai, bawang merah, telur, dan beras di meja pasar"

export const SITE_DESCRIPTION = "Harga pangan strategis Indonesia per provinsi."

/**
 * Google Search Console HTML-tag token.
 * Paste the token here, or set `GOOGLE_SITE_VERIFICATION` before `pnpm build`.
 * An empty value omits the meta tag.
 */
const SEARCH_CONSOLE_TOKEN = ""

function searchConsoleVerification(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.GOOGLE_SITE_VERIFICATION : undefined
  return (fromEnv || SEARCH_CONSOLE_TOKEN).trim()
}

export const SEARCH_CONSOLE_VERIFICATION = searchConsoleVerification()

export type SeoRouteId = "home" | "tren" | "daya-beli"

export type RouteSeo = {
  readonly id: SeoRouteId
  readonly path: "/" | "/tren" | "/daya-beli"
  readonly title: string
  readonly description: string
  readonly keywords: string
}

export const ROUTE_SEO: Record<SeoRouteId, RouteSeo> = {
  home: {
    id: "home",
    path: "/",
    title: "Peta Harga Pangan per Provinsi — Monitor Pangan",
    description:
      "Peta harga eceran pangan strategis di 38 provinsi. Bandingkan dengan rata-rata nasional. Sumber angka: PIHPS.",
    keywords:
      "harga pangan, peta harga, harga beras, harga cabai, provinsi, rata-rata nasional, PIHPS, eceran",
  },
  tren: {
    id: "tren",
    path: "/tren",
    title: "Tren Harga Pangan — Monitor Pangan",
    description:
      "Grafik pergerakan harga pangan strategis Indonesia. Lihat komoditas yang naik atau turun pada survei PIHPS.",
    keywords:
      "tren harga pangan, grafik harga, kenaikan harga, penurunan harga, komoditas strategis, PIHPS",
  },
  "daya-beli": {
    id: "daya-beli",
    path: "/daya-beli",
    title: "Daya Beli Pangan per Provinsi — Monitor Pangan",
    description:
      "UMP pekerja formal dibanding harga eceran PIHPS per provinsi. Menunjukkan berapa banyak komoditas yang terbeli.",
    keywords:
      "daya beli, UMP, upah minimum provinsi, harga pangan, pekerja formal, keterjangkauan",
  },
}

export function absoluteUrl(path: RouteSeo["path"]): string {
  if (path === "/") return `${SITE_ORIGIN}/`
  return `${SITE_ORIGIN}${path}`
}

export function jsonLd(id: SeoRouteId): string {
  const route = ROUTE_SEO[id]
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        name: "Monitor Pangan",
        url: `${SITE_ORIGIN}/`,
        inLanguage: "id-ID",
        description: SITE_DESCRIPTION,
      },
      {
        "@type": "WebPage",
        name: route.title,
        url: absoluteUrl(route.path),
        description: route.description,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        inLanguage: "id-ID",
      },
    ],
  })
}

type HeadMeta =
  | { readonly title: string }
  | { readonly name: string; readonly content: string }
  | { readonly property: string; readonly content: string }

export function seoMeta(id: SeoRouteId): HeadMeta[] {
  const route = ROUTE_SEO[id]
  const url = absoluteUrl(route.path)
  const image = `${SITE_ORIGIN}${OG_IMAGE_PATH}`
  const tags: HeadMeta[] = [
    { title: route.title },
    { name: "description", content: route.description },
    { name: "keywords", content: route.keywords },
    { name: "robots", content: "index, follow" },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "id_ID" },
    { property: "og:site_name", content: "Monitor Pangan" },
    { property: "og:title", content: route.title },
    { property: "og:description", content: route.description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: OG_IMAGE_ALT },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: route.title },
    { name: "twitter:description", content: route.description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: OG_IMAGE_ALT },
  ]
  if (SEARCH_CONSOLE_VERIFICATION.length > 0) {
    tags.push({
      name: "google-site-verification",
      content: SEARCH_CONSOLE_VERIFICATION,
    })
  }
  return tags
}

export function seoLinks(id: SeoRouteId): Array<{ rel: "canonical"; href: string }> {
  return [{ rel: "canonical", href: absoluteUrl(ROUTE_SEO[id].path) }]
}

export function seoScripts(
  id: SeoRouteId,
): Array<{ type: "application/ld+json"; children: string }> {
  return [{ type: "application/ld+json", children: jsonLd(id) }]
}

function replaceMeta(
  head: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const pattern = new RegExp(`<meta\\b[^>]*${attr}="${key}"[^>]*>`)
  if (!pattern.test(head)) throw new Error(`stamp: missing meta ${attr}=${key}`)
  return head.replace(pattern, `<meta ${attr}="${key}" content="${content}">`)
}

/** Replace home tags inside `<head>` with the tren or daya-beli tags. */
export function stampRouteHtml(html: string, id: "tren" | "daya-beli"): string {
  const home = ROUTE_SEO.home
  const route = ROUTE_SEO[id]
  const headMatch = /<head>([\s\S]*?)<\/head>/.exec(html)
  if (headMatch?.[1] == null) throw new Error("stamp: missing <head>")
  let head = headMatch[1]
  const homeJson = jsonLd("home")
  if (!head.includes(homeJson)) throw new Error("stamp: head missing home JSON-LD")
  head = head.replaceAll(homeJson, jsonLd(id))
  if (!head.includes(home.title)) throw new Error("stamp: head missing home title")
  head = head.replaceAll(home.title, route.title)
  head = replaceMeta(head, "name", "description", route.description)
  head = replaceMeta(head, "property", "og:description", route.description)
  head = replaceMeta(head, "name", "twitter:description", route.description)
  head = replaceMeta(head, "name", "keywords", route.keywords)
  const canonical = /<link\b[^>]*rel="canonical"[^>]*>/
  if (!canonical.test(head)) throw new Error("stamp: missing canonical")
  head = head.replace(
    canonical,
    `<link rel="canonical" href="${absoluteUrl(route.path)}">`,
  )
  const ogUrl = /<meta\b[^>]*property="og:url"[^>]*>/
  if (!ogUrl.test(head)) throw new Error("stamp: missing og:url")
  head = head.replace(
    ogUrl,
    `<meta property="og:url" content="${absoluteUrl(route.path)}">`,
  )
  if (head.includes(home.title)) throw new Error("stamp: home title still in head")
  return html.replace(/<head>[\s\S]*?<\/head>/, `<head>${head}</head>`)
}
