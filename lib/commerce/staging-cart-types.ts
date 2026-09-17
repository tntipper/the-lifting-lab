/** Safe browser projection only. Shopify cart IDs, line IDs and keys stay server-side. */
export type StagingCartView = {
  state: 'empty' | 'ready' | 'pending' | 'held' | 'unavailable' | 'session_changed'
  revision: number
  productId: string | null
  quantity: number
  unitPricePence: number | null
  subtotalPence: number | null
  currency: 'GBP'
  csrfToken: string | null
  message: string
}

export function stagingCartUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TLL_ENVIRONMENT === 'staging'
    && process.env.NEXT_PUBLIC_TLL_STAGING_CART === 'enabled'
}
