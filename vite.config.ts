import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
  server: {
    port: 3001,
    // Keep browser requests on the Vite origin while the local Worker owns APIs and photos.
    proxy: {
      "/api/": "http://127.0.0.1:8787",
      "/foto/": "http://127.0.0.1:8787",
    },
  },
  resolve: { tsconfigPaths: true },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{
            // Keep generated commodity histories out of the shared runtime chunk.
            name: (id) => {
              const commodity = /[\\/]data[\\/]trends[\\/]([a-z-]+)\.gen\.ts$/.exec(id)?.[1]
              return commodity == null ? null : `trend-${commodity}`
            },
            test: /[\\/]data[\\/]trends[\\/]/,
          }],
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
      prerender: {
        enabled: true,
        crawlLinks: true,
        // Query variants write the same `<route>/index.html` and race the plain route shell.
        filter: (page) => !page.path.includes("?"),
      },
    }),
    viteReact(),
  ],
})

export default config
