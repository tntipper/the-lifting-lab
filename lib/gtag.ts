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
