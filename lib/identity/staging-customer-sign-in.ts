/**
 * Browser entry for staging Customer Account admission.
 * Reuses the mounted prepare → start CSRF/cookie contract; never falls back to Google.
 */

const PREPARE = '/auth/customer/prepare'
const START = '/auth/customer/start'
const AUTHORIZE = '/auth/customer/authorize'
const OPAQUE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/

export type StagingCustomerSignInResult =
  | { status: 'redirect'; location: string }
  | { status: 'held'; message: string }

const HELD_MESSAGE = 'Staging customer sign-in is unavailable right now. Your account was not opened with Google or a magic link.'

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString()
}

function held(message = HELD_MESSAGE): StagingCustomerSignInResult {
  return { status: 'held', message }
}

function parsePrepareCsrf(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const csrf = (body as { csrf?: unknown }).csrf
  return typeof csrf === 'string' && OPAQUE.test(csrf) ? csrf : null
}

/** Start returns 303 to the same-origin authorize navigation, never a Google URL. */
function authorizeLocation(value: string | null, origin: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin || url.pathname !== AUTHORIZE || url.hash || url.username || url.password) return null
    if (!url.search || url.search.length > 4097) return null
    return url.href
  } catch {
    return null
  }
}

export type StagingCustomerSignInPorts = {
  fetch: typeof fetch
  origin: string
}

/**
 * Same-origin prepare then start. Caller navigates on `redirect`.
 * Fail-closed: any missing runtime, held response, or unexpected shape stays held.
 */
export async function startStagingCustomerSignIn(
  ports: StagingCustomerSignInPorts,
  signal?: AbortSignal,
): Promise<StagingCustomerSignInResult> {
  try {
    const prepare = await ports.fetch(new URL(PREPARE, ports.origin).href, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: formBody({ mode: 'sign_in' }),
      signal,
    })
    if (prepare.status !== 200) return held()
    const csrf = parsePrepareCsrf(JSON.parse(await prepare.text()))
    if (!csrf) return held()

    const start = await ports.fetch(new URL(START, ports.origin).href, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: formBody({ mode: 'sign_in', csrf }),
      signal,
    })
    if (start.status === 409) return held()
    if (start.status !== 303 && start.status !== 302) return held()
    const location = authorizeLocation(start.headers.get('location'), ports.origin)
    if (!location) return held()
    return { status: 'redirect', location }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return held()
  }
}

export { HELD_MESSAGE as STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE }
