// Node/server only. Unmounted and disabled by default; never import in a client.
import { Agent, request } from 'node:https'
import { decodeJwt, decodeProtectedHeader } from 'jose'
import { STAGING_SUPABASE_ISSUER, type SupabaseSessionProof } from './customer-connection'

const USER_URL = `${STAGING_SUPABASE_ISSUER}/user`
const MAX_TOKEN_BYTES = 16_384
const MAX_RESPONSE_BYTES = 131_072
const MAX_HEADER_BYTES = 16_384
const USER_AGENT = 'TheLiftingLab-Staging/1.0 (current authentication session verification)'
const privateAgent = new Agent({ keepAlive: false, rejectUnauthorized: true })
const authenticationMethods = new Set(['password', 'otp', 'magiclink', 'oauth'])
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const clock = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0
const seconds = (v: unknown): v is number => clock(v) && Number.isSafeInteger(v * 1000)
const authenticatedAudience = (v: unknown) => v === 'authenticated' || (Array.isArray(v) && v.length === 1 && v[0] === 'authenticated')

/** Trusted server/test injection, never an HTTP request parameter. No host,
 * proxy, redirect, TLS or credential-mode overrides exist in the real reader. */
export type SupabaseSessionTransport = (input: {
  url: string; method: 'GET'; headers: Readonly<Record<string, string>>
  signal: AbortSignal; maxBytes: number
}) => Promise<{ url: string; status: number; headers: readonly (readonly [string, string])[]; body: Uint8Array }>

// Errors are deliberately data-free, including errors emitted during abort.
const unavailable = () => new Error('Current session unavailable')
const nodeHttps: SupabaseSessionTransport = input => new Promise((resolve, reject) => {
  if (input.url !== USER_URL || input.method !== 'GET') { reject(unavailable()); return }
  const req = request(USER_URL, { method: 'GET', headers: input.headers, agent: privateAgent,
    rejectUnauthorized: true, signal: input.signal, maxHeaderSize: MAX_HEADER_BYTES }, res => {
    const chunks: Buffer[] = []; let size = 0
    const fail = () => { res.destroy(); reject(unavailable()) }
    // Node HTTPS follows no redirects and performs no automatic decompression.
    if (res.statusCode !== 200 || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) { fail(); return }
    res.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > input.maxBytes) { fail(); return }
      chunks.push(chunk)
    })
    res.once('error', fail)
    res.once('aborted', fail)
    res.once('end', () => {
      if (!res.complete || input.signal.aborted) { fail(); return }
      const headers: [string, string][] = []
      for (let i = 0; i < res.rawHeaders.length; i += 2) headers.push([res.rawHeaders[i], res.rawHeaders[i + 1]])
      resolve({ url: USER_URL, status: res.statusCode!, headers, body: Buffer.concat(chunks) })
    })
  })
  req.on('error', () => reject(unavailable()))
  req.end()
})

/** These are UNVERIFIED consistency checks, never local JWT authentication.
 * Only GET /user on the exact project, using this exact token, supplies signature
 * and current session authority. No keys/URLs from the token are ever fetched. */
function unverifiedToken(token: unknown, now: number) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_BYTES) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p) || Buffer.from(p, 'base64url').toString('base64url') !== p)) return null
  // Reject invalid UTF-8 rather than allowing a decoder to replace bytes.
  new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(parts[0], 'base64url'))
  new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(parts[1], 'base64url'))
  const h = decodeProtectedHeader(token), c = decodeJwt(token)
  if (!['HS256', 'RS256', 'ES256'].includes(h.alg ?? '') || (h.typ !== undefined && h.typ !== 'JWT')
    || ['crit', 'b64', 'jku', 'jwk', 'x5u'].some(k => Object.hasOwn(h, k))) return null
  const signatureBytes = Buffer.from(parts[2], 'base64url').length
  if ((h.alg === 'HS256' && signatureBytes !== 32) || (h.alg === 'ES256' && signatureBytes !== 64)
    || (h.alg === 'RS256' && (signatureBytes < 256 || signatureBytes > 1024))) return null
  if (c.iss !== STAGING_SUPABASE_ISSUER || !authenticatedAudience(c.aud) || c.role !== 'authenticated'
    || c.is_anonymous !== false || !uuid(c.sub) || !uuid(c.session_id)
    || !seconds(c.iat) || !seconds(c.exp) || c.iat * 1000 > now || c.exp * 1000 <= now || c.exp <= c.iat
    || (c.nbf !== undefined && (!seconds(c.nbf) || c.nbf * 1000 > now || c.nbf >= c.exp))) return null
  if (!Array.isArray(c.amr) || c.amr.length === 0 || c.amr.length > 32) return null
  let authenticatedAt = 0
  const methods = new Set<string>()
  for (const entry of c.amr) {
    if (!object(entry) || typeof entry.method !== 'string' || !/^[a-z0-9/_-]{1,64}$/.test(entry.method)
      || !seconds(entry.timestamp) || entry.timestamp > c.iat || methods.has(entry.method)) return null
    methods.add(entry.method)
    if (authenticationMethods.has(entry.method)) authenticatedAt = Math.max(authenticatedAt, entry.timestamp * 1000)
  }
  if (!authenticatedAt) return null
  return { userId: c.sub, sessionId: c.session_id, authenticatedAt, expiresAt: c.exp * 1000 }
}

function userFromResponse(r: Awaited<ReturnType<SupabaseSessionTransport>>) {
  if (!r || r.url !== USER_URL || r.status !== 200 || !(r.body instanceof Uint8Array)
    || !r.body.byteLength || r.body.byteLength > MAX_RESPONSE_BYTES || !Array.isArray(r.headers)) return null
  const headers = new Map<string, string>(); let size = 0
  for (const pair of r.headers) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null
    const [name, value] = pair, key = name.toLowerCase(); size += name.length + value.length
    if (size > MAX_HEADER_BYTES || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key) || /[\r\n\x00]/.test(value)) return null
    if (headers.has(key) && ['content-type', 'content-length', 'content-encoding'].includes(key)) return null
    headers.set(key, value)
  }
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(headers.get('content-type') ?? '')
    || (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity')) return null
  const length = headers.get('content-length')
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) !== r.body.byteLength)) return null
  const user: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(r.body))
  if (!object(user) || ['error', 'error_code', 'error_description'].some(k => Object.hasOwn(user, k))) return null
  return user
}

/** Supply a request-scoped SSR cookie access-token accessor, not a browser token
 * argument, decoded user, getSession proof, global client or caller-supplied
 * currentSession implementation. The accessor returns token material only; this
 * adapter verifies it. It is read again after HTTP: any change requires a fresh
 * call, never substitution of an unverified new token/session into this proof.
 *
 * No result is cached. Stale authentication can yield a current session proof:
 * the connection domain separately enforces its five-minute reauthentication
 * requirement at start/callback without preventing normal refresh/logout.
 */
export function createStagingSupabaseSessionReader(input: {
  enabled?: boolean; publishableKey?: string
  readAccessToken(): Promise<string | null>
  transport?: SupabaseSessionTransport; now?: () => number; timeoutMs?: number
}): { currentSession(): Promise<SupabaseSessionProof | null> } {
  const { enabled, publishableKey, readAccessToken } = input
  const transport = input.transport ?? nodeHttps, now = input.now ?? Date.now, timeoutMs = input.timeoutMs ?? 5000
  return Object.freeze({ async currentSession() {
    if (enabled !== true || typeof window !== 'undefined' || typeof readAccessToken !== 'function'
      || typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publishableKey)
      || !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 10_000) return null
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const startedAt = now()
      if (!clock(startedAt)) return null
      return await Promise.race([
        (async (): Promise<SupabaseSessionProof | null> => {
          const token = await readAccessToken()
          if (controller.signal.aborted) return null
          const claims = unverifiedToken(token, startedAt)
          if (!claims) return null
          const response = await transport({ url: USER_URL, method: 'GET', signal: controller.signal, maxBytes: MAX_RESPONSE_BYTES,
            headers: Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store',
              'user-agent': USER_AGENT, apikey: publishableKey, authorization: `Bearer ${token}` }) })
          if (controller.signal.aborted) return null
          const user = userFromResponse(response)
          if (!user || user.id !== claims.userId || user.role !== 'authenticated' || user.aud !== 'authenticated'
            || user.is_anonymous !== false) return null
          // GET /user does not return a session identifier. Its authenticated
          // handler loads the signed token's non-empty session_id server-side.
          if (await readAccessToken() !== token || controller.signal.aborted) return null
          const checkedAt = now()
          if (!clock(checkedAt) || checkedAt < startedAt || checkedAt - startedAt > timeoutMs || claims.expiresAt <= checkedAt) return null
          return Object.freeze({ ...claims, issuer: STAGING_SUPABASE_ISSUER, audience: 'authenticated', anonymous: false, checkedAt })
        })(),
        new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null) }, timeoutMs) }),
      ])
    } catch { return null } finally { clearTimeout(timer); controller.abort() }
  } })
}
