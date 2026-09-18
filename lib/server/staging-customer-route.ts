// Node-only mounted boundary for the staging customer admission delivery.
import { createStagingCustomerRuntime, type StagingCustomerRuntime } from '@/lib/server/staging-customer'
import { STAGING_POSTGRES_PROJECT_REF } from '@/lib/server/staging-postgres'

const STORAGE = `sb-${STAGING_POSTGRES_PROJECT_REF}-auth-token`
const MAX_COOKIE_BYTES = 32_768, MAX_SESSION_BYTES = 32_768, MAX_CHUNKS = 12, MAX_TOKEN_BYTES = 16_384
type Action = 'prepare' | 'start' | 'authorize' | 'shopify-callback' | 'recover'
type RuntimeFactory = typeof createStagingCustomerRuntime

function held() {
  return Response.json({ status: 'held' }, { status: 409, headers: {
    'cache-control': 'no-store, private', pragma: 'no-cache', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  } })
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
  runtimeFactory: RuntimeFactory = createStagingCustomerRuntime): Promise<Response> {
  let runtime: StagingCustomerRuntime | null = null
  try {
    runtime = runtimeFactory({ readAccessToken: async () => stagingSupabaseAccessToken(request) })
    if (!runtime) return held()
    const method = action === 'authorize' ? 'admit' : action === 'shopify-callback' ? 'shopifyCallback' : action
    const response = await runtime.delivery[method](request)
    await runtime.close(); runtime = null
    return response
  } catch {
    if (runtime) try { await runtime.close() } catch { /* response remains held */ }
    return held()
  }
}
