export type PriceUnit = "kg" | "liter"

export type Commodity = {
  id: string
  name: string
  unit: PriceUnit
  /** Display group for the grouped commodity picker. */
  group: string
  /** Mock national anchor price used until the real pipeline lands. */
  anchor: number
}

export const COMMODITIES: Commodity[] = [
  { id: "beras", name: "Beras", unit: "kg", group: "Bahan pokok", anchor: 13500 },
  { id: "bawang-merah", name: "Bawang Merah", unit: "kg", group: "Bumbu", anchor: 38000 },
  { id: "bawang-putih", name: "Bawang Putih", unit: "kg", group: "Bumbu", anchor: 42000 },
  { id: "cabai-merah", name: "Cabai Merah", unit: "kg", group: "Bumbu", anchor: 45000 },
  { id: "cabai-rawit", name: "Cabai Rawit", unit: "kg", group: "Bumbu", anchor: 60000 },
  { id: "daging-ayam", name: "Daging Ayam Ras", unit: "kg", group: "Protein", anchor: 38000 },
  { id: "daging-sapi", name: "Daging Sapi", unit: "kg", group: "Protein", anchor: 140000 },
  { id: "telur-ayam", name: "Telur Ayam Ras", unit: "kg", group: "Protein", anchor: 30000 },
  { id: "gula-pasir", name: "Gula Pasir", unit: "kg", group: "Bahan pokok", anchor: 18500 },
  { id: "minyak-goreng", name: "Minyak Goreng", unit: "liter", group: "Bahan pokok", anchor: 23000 },
]

/** Mock trading-day snapshots (Mon–Fri mirrors PIHPS survey days). */
export const MOCK_DATES = ["2026-09-14", "2026-09-15", "2026-09-16"]
