import type { AffordabilitySort, AffordabilityTier } from "#/lib/daya-beli.ts"

/** Rank chip: dark text on a pale tint, except the strongest tier which is solid. */
export function tierChipClass(tier: AffordabilityTier): string {
  switch (tier) {
    case "best":
      return "bg-leaf-deep text-paper"
    case "high":
      return "bg-leaf-soft text-leaf-deep"
    case "mid":
      return "bg-gold-soft text-ink"
    case "low":
      return "bg-heat-soft text-ink"
    case "worst":
      return "bg-ember-soft text-ember"
    case "gap":
      return "bg-muted text-slate"
    default: {
      const _exhaustive: never = tier
      return _exhaustive
    }
  }
}

/** Opaque row wash. Text stays ink or slate on top of these tints. */
export function tierWashClass(tier: AffordabilityTier): string {
  switch (tier) {
    case "best":
      return "bg-leaf-soft"
    case "high":
      return "bg-leaf-soft"
    case "mid":
      return "bg-gold-soft"
    case "low":
      return "bg-heat-soft"
    case "worst":
      return "bg-ember-soft"
    case "gap":
      return "bg-muted"
    default: {
      const _exhaustive: never = tier
      return _exhaustive
    }
  }
}

/** Solid swatch for the scale legend and the row edge. */
export function tierSwatchClass(tier: AffordabilityTier): string {
  switch (tier) {
    case "best":
      return "bg-leaf-deep"
    case "high":
      return "bg-leaf"
    case "mid":
      return "bg-gold"
    case "low":
      return "bg-heat"
    case "worst":
      return "bg-ember"
    case "gap":
      return "bg-muted"
    default: {
      const _exhaustive: never = tier
      return _exhaustive
    }
  }
}

export function tierLabel(tier: AffordabilityTier): string {
  switch (tier) {
    case "best":
      return "Paling kuat"
    case "high":
      return "Kuat"
    case "mid":
      return "Menengah"
    case "low":
      return "Lemah"
    case "worst":
      return "Paling lemah"
    case "gap":
      return "Data tidak tersedia"
    default: {
      const _exhaustive: never = tier
      return _exhaustive
    }
  }
}

/** Active sort uses the same good/poor hues as the rank scale. */
export function sortActiveClass(sort: Extract<AffordabilitySort, "amount-desc" | "amount-asc">): string {
  switch (sort) {
    case "amount-desc":
      return "border-leaf-deep bg-leaf-deep text-paper"
    case "amount-asc":
      return "border-ember bg-ember text-paper"
    default: {
      const _exhaustive: never = sort
      return _exhaustive
    }
  }
}
