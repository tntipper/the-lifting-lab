// GA4 event helper. Measurement ID injected via layout.tsx gtag.js.
export const GA_MEASUREMENT_ID = 'G-R3YMG6TYXF'

type GtagParams = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

// Fire a GA4 event. No-ops safely on the server or before gtag loads.
export function track(event: string, params: GtagParams = {}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', event, params)
}

function outboundHost(href: string): string | undefined {
  try {
    return new URL(href).hostname
  } catch {
    return undefined
  }
}

// Affiliate Buy click. Mark buy_click as a conversion in GA4 Admin → Events;
// that cannot be set from code.
export function trackBuyClick(params: {
  product_id: string
  product_name: string
  brand: string
  category: string
  href: string
}): void {
  track('buy_click', {
    product_id: params.product_id,
    product_name: params.product_name,
    brand: params.brand,
    category: params.category,
    outbound_host: outboundHost(params.href),
  })
}
