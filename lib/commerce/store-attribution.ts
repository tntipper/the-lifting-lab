export type StoreAttributionCampaign = 'stack' | 'product' | 'compare'

/** Fixed site attribution only: never include customer or supplier information. */
export function storeAttributionAttributes(campaign: StoreAttributionCampaign) {
  return [
    { key: 'utm_source', value: 'theliftinglab' },
    { key: 'utm_medium', value: 'referral' },
    { key: 'utm_campaign', value: campaign },
    { key: 'ref', value: 'theliftinglab' },
  ]
}

/** set() replaces existing values (including duplicates), preserving variant/quantities. */
export function withStoreAttribution(link: string, campaign: StoreAttributionCampaign): string {
  const url = new URL(link)
  for (const { key, value } of storeAttributionAttributes(campaign)) url.searchParams.set(key, value)
  return url.href
}

export function storeCartAttribution(campaign: StoreAttributionCampaign) {
  return {
    attributes: storeAttributionAttributes(campaign),
    note: `The Lifting Lab referral (${campaign})`,
  }
}
