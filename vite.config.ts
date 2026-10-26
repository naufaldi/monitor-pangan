import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
  server: {
    port: 3001,
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
      prerender: { enabled: true, crawlLinks: true },
    }),
    viteReact(),
  ],
})

export default config
