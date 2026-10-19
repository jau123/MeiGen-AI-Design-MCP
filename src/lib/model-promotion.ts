/** Display metadata only. Generation rates already include the promotion. */
export function getModelPromotion(config: Record<string, unknown> | null | undefined) {
  const value = config?.promotion
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const promotion = value as Record<string, unknown>
  const percent = promotion.discountPercent
  if (promotion.enabled !== true || promotion.priceBasis !== 'meigen_regular'
    || promotion.pricesIncludeDiscount !== true || typeof percent !== 'number'
    || !Number.isInteger(percent) || percent <= 0 || percent >= 100) return null
  return { discountPercent: percent, label: `${percent}% OFF` }
}

/** Operational status takes precedence; promotions replace New in the list only. */
export function getModelListTags(config: Record<string, unknown> | null | undefined): string[] {
  const tags = Array.isArray(config?.tags) ? config.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const status = ['Maintenance', 'Busy'].filter(tag => tags.includes(tag))
  if (status.length) return status
  const promotion = getModelPromotion(config)
  if (promotion) return [promotion.label]
  // A disabled/malformed promotion must not leave a legacy discount tag visible.
  return config?.promotion !== undefined ? tags.filter(tag => !/^\d+% OFF$/i.test(tag)) : tags
}

export function formatModelPromotion(config: Record<string, unknown> | null | undefined): string | null {
  const promotion = getModelPromotion(config)
  return promotion ? `${promotion.label} vs MeiGen regular prices. All listed credit rates already include this discount; do not apply it again.` : null
}
