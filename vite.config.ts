import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { cloudflare } from "@cloudflare/vite-plugin"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
  server: {
    port: 3001,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // The Cloudflare workerd runner breaks Vitest workers; unit tests
    // never need real bindings, so the plugin stays out of test runs.
    ...(process.env.VITEST === "true" ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tanstackStart({
      spa: { enabled: true },
      prerender: { enabled: true, crawlLinks: true },
    }),
    viteReact(),
  ],
})

export default config
