import { Effect } from "effect"
import { assert, it } from "@effect/vitest"

import { SNAPSHOT_META } from "./data/snapshot.gen.ts"
import {
  OG_IMAGE_ALT,
  ROUTE_SEO,
  SEARCH_CONSOLE_VERIFICATION,
  SITE_DESCRIPTION,
  SITE_ORIGIN,
  absoluteUrl,
  jsonLd,
  seoLinks,
  seoMeta,
  stampRouteHtml,
} from "./seo.ts"

const IDS = ["home", "tren", "daya-beli"] as const

it.effect("route copy is Indonesian, unique, and safe to stamp into HTML", () =>
  Effect.sync(() => {
    const titles = new Set<string>()
    for (const id of IDS) {
      const route = ROUTE_SEO[id]
      titles.add(route.title)
      assert.ok(route.title.length <= 60)
      assert.ok(route.description.length >= 70 && route.description.length <= 160)
      for (const value of [route.title, route.description, route.keywords, OG_IMAGE_ALT, SITE_DESCRIPTION]) {
        assert.strictEqual(value.includes("Data contoh"), false)
        assert.strictEqual(value.toLowerCase().includes("data resmi"), false)
        assert.strictEqual(/["<>&]/.test(value), false)
      }
      if (SNAPSHOT_META.pricesLive) {
        assert.ok(route.description.includes("PIHPS"))
      }
    }
    assert.strictEqual(titles.size, 3)
  }),
)

it.effect("social URLs are absolute and canonical URLs drop the commodity query", () =>
  Effect.sync(() => {
    assert.strictEqual(absoluteUrl("/"), `${SITE_ORIGIN}/`)
    assert.strictEqual(absoluteUrl("/tren"), `${SITE_ORIGIN}/tren`)
    assert.strictEqual(absoluteUrl("/daya-beli"), `${SITE_ORIGIN}/daya-beli`)
    for (const id of IDS) {
      const image = seoMeta(id).find(
        (tag) => "property" in tag && tag.property === "og:image",
      )
      assert.ok(image && "content" in image)
      assert.strictEqual(image.content, `${SITE_ORIGIN}/og.png`)
      const canonical = seoLinks(id)[0]
      assert.strictEqual(canonical.rel, "canonical")
      assert.strictEqual(canonical.href.includes("komoditas"), false)
      assert.strictEqual(canonical.href.startsWith(`${SITE_ORIGIN}/`), true)
      const verification = seoMeta(id).find(
        (tag) => "name" in tag && tag.name === "google-site-verification",
      )
      if (SEARCH_CONSOLE_VERIFICATION.length > 0) {
        assert.ok(verification && "content" in verification)
        assert.strictEqual(verification.content, SEARCH_CONSOLE_VERIFICATION)
      } else {
        assert.strictEqual(verification, undefined)
      }
      assert.strictEqual(
        seoMeta(id).some((tag) => "name" in tag && tag.name === "twitter:site"),
        false,
      )
    }
  }),
)

it.effect("JSON-LD is WebSite plus WebPage and keeps the site URL stable", () =>
  Effect.sync(() => {
    for (const id of IDS) {
      const graph = JSON.parse(jsonLd(id)) as {
        "@graph": Array<{ "@type": string; url: string; name?: string }>
      }
      const site = graph["@graph"].find((node) => node["@type"] === "WebSite")
      const page = graph["@graph"].find((node) => node["@type"] === "WebPage")
      assert.ok(site)
      assert.ok(page)
      assert.strictEqual(site.url, `${SITE_ORIGIN}/`)
      assert.strictEqual(page.url, absoluteUrl(ROUTE_SEO[id].path))
      assert.strictEqual(page.name, ROUTE_SEO[id].title)
      assert.strictEqual(jsonLd(id).includes("Dataset"), false)
    }
  }),
)

it.effect("stamp rewrites head tags and leaves the body title alone", () =>
  Effect.sync(() => {
    const home = ROUTE_SEO.home
    const html = `<!doctype html><html lang="id"><head>
<title>${home.title}</title>
<meta name="description" content="${home.description}">
<meta name="keywords" content="${home.keywords}">
<link rel="canonical" href="${absoluteUrl("/")}">
<meta property="og:url" content="${absoluteUrl("/")}">
<meta property="og:image" content="${SITE_ORIGIN}/og.png">
<script type="application/ld+json">${jsonLd("home")}</script>
</head><body>${home.title}</body></html>`
    const stamped = stampRouteHtml(html, "tren")
    const head = stamped.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? ""
    assert.ok(head.includes(ROUTE_SEO.tren.title))
    assert.strictEqual(head.includes(home.title), false)
    assert.ok(head.includes(ROUTE_SEO.tren.description))
    assert.ok(head.includes('rel="canonical" href="https://monitor.naufaldi.com/tren"'))
    assert.ok(head.includes('property="og:url" content="https://monitor.naufaldi.com/tren"'))
    assert.ok(head.includes(`${SITE_ORIGIN}/og.png`))
    assert.ok(stamped.includes(`<body>${home.title}</body>`))
    const page = (
      JSON.parse(
        head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "{}",
      ) as { "@graph": Array<{ "@type": string; url: string }> }
    )["@graph"].find((node) => node["@type"] === "WebPage")
    assert.strictEqual(page?.url, "https://monitor.naufaldi.com/tren")
  }),
)
