import rawGeo from "indonesia-geodata/indonesiaLow"

export type Province = {
  code: string
  name: string
}

export type ProvinceFeature = {
  type: "Feature"
  properties: { code: string; name: string } & Record<string, unknown>
  geometry: unknown
}

function provinceOf(feature: {
  properties: Record<string, unknown>
}): Province | null {
  const code = feature.properties["REGION_CODE"]
  const name = feature.properties["name"]
  if (typeof code !== "string" || typeof name !== "string") return null
  return { code, name }
}

/** Provinces derived from the bundled GeoJSON, sorted by region code. */
export function loadProvinces(): Province[] {
  const seen = new Map<string, string>()
  for (const feature of rawGeo.features) {
    const province = provinceOf(feature)
    if (province != null && !seen.has(province.code)) {
      seen.set(province.code, province.name)
    }
  }
  return [...seen.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

export function provinceFeatures(): ProvinceFeature[] {
  const features: ProvinceFeature[] = []
  for (const feature of rawGeo.features) {
    const province = provinceOf(feature)
    if (province == null) continue
    features.push({
      type: "Feature",
      properties: { ...province, ...feature.properties },
      geometry: feature.geometry,
    })
  }
  return features
}
