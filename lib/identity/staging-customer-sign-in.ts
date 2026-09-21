/**
 * Browser entry for staging Customer Account admission.
 * Reuses the mounted prepare → start CSRF/cookie contract; never falls back to Google.
 */

const PREPARE = '/auth/customer/prepare'
const START = '/auth/customer/start'
const OPAQUE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/

export type StagingCustomerSignInResult =
  | { status: 'submit'; action: string; fields: Readonly<{ mode: 'sign_in'; csrf: string }> }
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

export type StagingCustomerSignInPorts = {
  fetch: typeof fetch
  origin: string
}

/**
 * Same-origin prepare. Caller submits the returned fixed-action form as a real
 * document navigation, allowing the browser to follow the start route's 303.
 * Browser fetch cannot inspect a `redirect: manual` response: it is exposed as
 * an opaque redirect with status 0 and no Location header.
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

    return {
      status: 'submit',
      action: new URL(START, ports.origin).href,
      fields: Object.freeze({ mode: 'sign_in', csrf }),
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return held()
  }
}

export { HELD_MESSAGE as STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE }
