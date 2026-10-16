/**
 * Hex mirror of the color tokens in tokens.css, for places CSS variables cannot
 * reach (Leaflet path styles, SVG attributes). tokens.test.ts keeps them in sync.
 */
export const color = {
  canvas: "#f4f5f0",
  paper: "#ffffff",
  ink: "#1a1c16",
  slate: "#5c6358",
  hairline: "#e4e6df",
  ember: "#dc2626",
  emberSoft: "#fef2f2",
  heat: "#f97316",
  heatSoft: "#fff1e6",
  gold: "#eab308",
  goldSoft: "#fdf8e6",
  leaf: "#00bd7d",
  leafSoft: "#e7f6ef",
  leafDeep: "#00714c",
  selected: "#e9ebe3",
} as const

export type ColorToken = keyof typeof color
