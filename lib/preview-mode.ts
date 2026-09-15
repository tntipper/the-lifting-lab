/** Build-time public marker; direct env access is inlined by Next on both targets. */
export function isSyntheticPreview(): boolean {
  return process.env.NEXT_PUBLIC_TLL_ENVIRONMENT === 'synthetic-preview'
}

/** Hosted staging can exercise its own accounts while remaining noncommercial. */
export function isHostedStaging(): boolean {
  return process.env.NEXT_PUBLIC_TLL_ENVIRONMENT === 'staging'
}

export function isIsolatedEnvironment(): boolean {
  return isSyntheticPreview() || isHostedStaging()
}

export function stagingConnectionPolicy(): string {
  let origin = ''
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    if (url.protocol === 'https:' && /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
      && url.hostname !== 'wrhgscovsgsudtedbljr.supabase.co'
      && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash) origin = ` ${url.origin}`
  } catch { /* Invalid staging configuration cannot expand browser connections. */ }
  return `connect-src 'self'${origin}; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'`
}

export const PREVIEW_UNAVAILABLE_MESSAGE = 'Visual preview only. Live data, accounts, forms and purchases are disabled.'

/** Used by middleware and the Supabase transport without making a network call. */
export function previewUnavailableResponse(status = 503): Response {
  return Response.json({ error: PREVIEW_UNAVAILABLE_MESSAGE, code: 'synthetic_preview_unavailable' }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-TLL-Preview': 'synthetic', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}

/** Defence in depth for server rendering and browser SDK calls outside API routes. */
export const guardedSupabaseFetch: typeof fetch = (input, init) => {
  if (isSyntheticPreview()) return Promise.resolve(previewUnavailableResponse(403))
  return fetch(input, init)
}

export function isPreviewAccountPath(pathname: string): boolean {
  return ['/auth', '/account', '/dashboard', '/favourites', '/stack', '/rewards', '/contact', '/submit']
    .some(path => pathname === path || pathname.startsWith(path + '/'))
}
