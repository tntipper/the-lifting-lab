// Node-only mounted boundary for the staging customer admission delivery.
import { createStagingCustomerRuntime, type StagingCustomerRuntime } from '@/lib/server/staging-customer'
import { STAGING_POSTGRES_PROJECT_REF } from '@/lib/server/staging-postgres'
import { stagingCustomerSessionResponse } from '@/lib/server/staging-customer-session'

const STORAGE = `sb-${STAGING_POSTGRES_PROJECT_REF}-auth-token`
const MAX_COOKIE_BYTES = 32_768, MAX_SESSION_BYTES = 32_768, MAX_CHUNKS = 12, MAX_TOKEN_BYTES = 16_384
type Action = 'prepare' | 'start' | 'authorize' | 'shopify-callback' | 'callback' | 'recover' | 'orders' | 'logout'
type RuntimeFactory = typeof createStagingCustomerRuntime

function held() {
  return Response.json({ status: 'held' }, { status: 409, headers: {
    'cache-control': 'no-store, private', pragma: 'no-cache', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  } })
}

function privateHeaders() {
  return { 'cache-control': 'no-store, private', pragma: 'no-cache', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff', vary: 'Cookie' }
}

function expireStagingSession(response: Response) {
  const expired = 'Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  response.headers.append('set-cookie', `${STORAGE}=; ${expired}`)
  for (let index = 0; index < MAX_CHUNKS; index++) response.headers.append('set-cookie', `${STORAGE}.${index}=; ${expired}`)
}

function logoutResponse(outcome: Awaited<ReturnType<StagingCustomerRuntime['accountLogout']['logout']>>) {
  let location = '/auth?error=signout_failed'
  const providerRedirect = outcome.status === 'logged_out' ? outcome.providerRedirect : null
  if (outcome.status === 'logged_out' && providerRedirect === null) location = '/auth'
  else if (providerRedirect !== null) {
    const url = new URL(providerRedirect)
    const params = [...url.searchParams.keys()]
    const post = url.searchParams.get('post_logout_redirect_uri')
    if (url.origin + url.pathname !== 'https://shopify.com/authentication/107532616020/logout'
      || params.length !== 2 || params[0] !== 'id_token_hint' || params[1] !== 'post_logout_redirect_uri'
      || !url.searchParams.get('id_token_hint') || !post
      || !/^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app\/auth$/.test(post)) throw new Error('Invalid logout redirect')
    location = url.href
  }
  const response = new Response(null, { status: 303, headers: { ...privateHeaders(), location } })
  expireStagingSession(response)
  return response
}

/** Read only the fixed Supabase SSR cookie for this staging project. The value
 * remains unverified here; createStagingSupabaseSessionReader authenticates it
 * against the exact GET /user endpoint before it can become session authority. */
export function stagingSupabaseAccessToken(request: Request): string | null {
  try {
    const header = request.headers.get('cookie') ?? ''
    if (!header || Buffer.byteLength(header) > MAX_COOKIE_BYTES || /[\x00-\x1f\x7f]/.test(header)) return null
    const values = new Map<string, string>()
    for (const part of header.split(';')) {
      const at = part.indexOf('='); if (at < 1) continue
      const name = part.slice(0, at).trim(), value = part.slice(at + 1).trim()
      if (name !== STORAGE && !new RegExp(`^${STORAGE.replaceAll('-', '\\-')}\\.(0|[1-9][0-9]?)$`).test(name)) continue
      if (!value || values.has(name) || !/^[A-Za-z0-9_-]+$/.test(value)) return null
      values.set(name, value)
    }
    let encoded = values.get(STORAGE)
    if (encoded && values.size !== 1) return null
    if (!encoded) {
      const chunks: string[] = []
      for (let index = 0; index < MAX_CHUNKS; index++) {
        const value = values.get(`${STORAGE}.${index}`)
        if (!value) break
        chunks.push(value)
      }
      if (!chunks.length || chunks.length !== values.size || values.has(`${STORAGE}.${MAX_CHUNKS}`)) return null
      encoded = chunks.join('')
    }
    if (!encoded.startsWith('base64-')) return null
    const payload = encoded.slice(7)
    if (!payload || payload.length > 50_000 || !/^[A-Za-z0-9_-]+$/.test(payload)) return null
    const bytes = Buffer.from(payload, 'base64url')
    if (bytes.length < 2 || bytes.length > MAX_SESSION_BYTES || bytes.toString('base64url') !== payload) return null
    const session: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null
    const token = (session as Record<string, unknown>).access_token
    return typeof token === 'string' && token.length >= 32 && token.length <= MAX_TOKEN_BYTES
      && !/[\x00-\x1f\x7f]/.test(token) ? token : null
  } catch { return null }
}

/** One runtime per request; no pool, vault or token accessor is shared globally. */
export async function stagingCustomerRoute(request: Request, action: Action,
  runtimeFactory: RuntimeFactory = createStagingCustomerRuntime,
  invalidateSupabaseSession: () => Promise<boolean> = async () => false): Promise<Response> {
  let runtime: StagingCustomerRuntime | null = null
  try {
    runtime = runtimeFactory({ readAccessToken: async () => stagingSupabaseAccessToken(request), invalidateSupabaseSession })
    if (!runtime) return held()
    if (action === 'orders') {
      const projection = await runtime.accountOperations.readOrders()
      await runtime.close(); runtime = null
      return Response.json(projection, { status: 200, headers: privateHeaders() })
    }
    if (action === 'logout') {
      const outcome = await runtime.accountLogout.logout()
      try { await runtime.close() } catch { /* local and Supabase revocation already ran */ }
      runtime = null
      return logoutResponse(outcome)
    }
    if (action === 'callback') {
      const reconciliation = runtime.finalReconciliation
      const binding = runtime.delivery.finalBinding(request)
      const release = await reconciliation.complete(binding)
      let response: Response
      try { response = stagingCustomerSessionResponse(release) }
      catch {
        try { await reconciliation.hold(binding) } catch { /* no browser release after failed quarantine */ }
        throw new Error('Staging customer session unavailable')
      }
      try { await runtime.close(); runtime = null }
      catch {
        try { await reconciliation.hold(binding) } catch { /* no browser release after failed quarantine */ }
        throw new Error('Staging customer cleanup unavailable')
      }
      return response
    }
    const method = action === 'authorize' ? 'admit' : action === 'shopify-callback' ? 'shopifyCallback' : action
    const response = await runtime.delivery[method](request)
    await runtime.close(); runtime = null
    return response
  } catch {
    if (runtime) try { await runtime.close() } catch { /* response remains held */ }
    return held()
  }
}

export const stagingCustomerLogoutRoute = (request: Request, invalidateSupabaseSession: () => Promise<boolean>) =>
  stagingCustomerRoute(request, 'logout', createStagingCustomerRuntime, invalidateSupabaseSession)
