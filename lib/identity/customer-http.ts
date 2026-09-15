// Node-only private adapters: no browser import, route or activation is shipped.
import { Agent, request } from 'node:https'
import { createHash } from 'node:crypto'
import { decodeProtectedHeader, type JSONWebKeySet } from 'jose'
import { createLocalCustomerIdVerifier } from './customer-id-token'
import { CUSTOMER_SCOPES, STAGING_CUSTOMER_CLIENT_ID, STAGING_ISSUER, type ConnectionPorts, type IdVerification, type TokenResponse, type VerifiedId } from './customer-connection'

const TOKEN_URL = `${STAGING_ISSUER}/oauth/token`
const JWKS_URL = `${STAGING_ISSUER}/.well-known/jwks.json`
const SCOPE = CUSTOMER_SCOPES.join(' ')
const MAX_BYTES = 131_072
const MAX_AGE_MS = 300_000
const ROTATION_COOLDOWN_MS = 30_000
const privateAgent = new Agent({ keepAlive: false, rejectUnauthorized: true })

export class CustomerHttpHeld extends Error {
  readonly code = 'CUSTOMER_HTTP_HELD'
  readonly outcome: 'not_attempted' | 'uncertain'
  constructor(outcome: 'not_attempted' | 'uncertain') { super('Customer account HTTP operation held'); this.name = 'CustomerHttpHeld'; this.outcome = outcome }
}
/** Trusted injection for offline tests, not an alternative browser transport.
 * The real implementation has no caller-controlled host, agent, proxy or TLS flag.
 */
export type CustomerHttpTransport = (input: {
  url: string; method: 'GET' | 'POST'; headers: Readonly<Record<string, string>>
  body: string | null; signal: AbortSignal; maxBytes: number
}) => Promise<{ url: string; status: number; headers: readonly (readonly [string, string])[]; body: Uint8Array }>

const nodeHttps: CustomerHttpTransport = input => new Promise((resolve, reject) => {
  if (!((input.url === TOKEN_URL && input.method === 'POST') || (input.url === JWKS_URL && input.method === 'GET'))) { reject(new CustomerHttpHeld('not_attempted')); return }
  const req = request(input.url, { method: input.method, headers: input.headers, agent: privateAgent, rejectUnauthorized: true,
    signal: input.signal, maxHeaderSize: 16_384 }, res => {
    const chunks: Buffer[] = []; let size = 0
    const fail = () => { res.destroy(); reject(new CustomerHttpHeld('uncertain')) }
    // Node https never follows redirects or automatically decompresses a body.
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
      resolve({ url: input.url, status: res.statusCode!, headers, body: Buffer.concat(chunks) })
    })
  })
  // Keep the handler through abort cleanup as well as the first socket error.
  req.on('error', () => reject(new CustomerHttpHeld('uncertain')))
  req.end(input.body ?? undefined)
})
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x20\x7f]/.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const clock = (n: number) => Number.isSafeInteger(n) && n > 0
const exactScope = (v: unknown): v is string => typeof v === 'string' && v.split(' ').length === CUSTOMER_SCOPES.length && CUSTOMER_SCOPES.every(s => v.split(' ').includes(s))
const callbackValid = (value: string) => {
  try { const u = new URL(value); return u.href === value && u.protocol === 'https:' && u.hostname.endsWith('.vercel.app') && !u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname === '/auth/shopify/callback' } catch { return false }
}
type HttpOptions = { enabled?: boolean; transport?: CustomerHttpTransport; timeoutMs?: number }

async function jsonRequest(options: HttpOptions, url: string, method: 'GET' | 'POST', headers: Record<string, string>, body: string | null) {
  const timeout = options.timeoutMs ?? 5000
  if (options.enabled !== true || !Number.isInteger(timeout) || timeout < 50 || timeout > 10_000 || typeof window !== 'undefined') throw new CustomerHttpHeld('not_attempted')
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const input = { url, method, headers: Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity', ...headers }), body, signal: controller.signal, maxBytes: MAX_BYTES }
    const response = await Promise.race([
      Promise.resolve().then(() => (options.transport ?? nodeHttps)(input)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CustomerHttpHeld('uncertain')) }, timeout) }),
    ])
    if (controller.signal.aborted || response.url !== url || response.status !== 200 || !(response.body instanceof Uint8Array)
      || response.body.byteLength === 0 || response.body.byteLength > MAX_BYTES || !Array.isArray(response.headers)) throw new Error('invalid response')
    const h = new Map<string, string>()
    let headerSize = 0
    for (const pair of response.headers) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') throw new Error('invalid header')
      const [name, value] = pair, key = name.toLowerCase(); headerSize += name.length + value.length
      if (headerSize > 16_384 || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key) || /[\r\n\x00]/.test(value)) throw new Error('invalid header')
      if (h.has(key) && ['content-type', 'content-length', 'content-encoding', 'cache-control', 'age', 'date'].includes(key)) throw new Error('ambiguous header')
      h.set(key, value)
    }
    const media = h.get('content-type') ?? ''
    if (!(url === JWKS_URL ? /^application\/(?:json|jwk-set\+json)(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i : /^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i).test(media)
      || (h.has('content-encoding') && h.get('content-encoding') !== 'identity')) throw new Error('invalid representation')
    if (h.has('content-length') && (!/^\d+$/.test(h.get('content-length')!) || Number(h.get('content-length')) !== response.body.byteLength)) throw new Error('truncated response')
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))
    return { data, headers: h }
  } catch { throw new CustomerHttpHeld('uncertain') }
  finally { if (timer) clearTimeout(timer); controller.abort() }
}

/** Default-disabled Confidential adapter. Supply the exact authorization scope
 * and callback from trusted server configuration, never request query/body data.
 * The state/claim domain must authorize each call; this is not a retry ledger.
 */
export function createShopifyCustomerTokenAdapter(options: HttpOptions & {
  clientSecret?: string; callbackUrl: string; authorizationScope: string
}): Pick<ConnectionPorts, 'exchangeCode' | 'refreshToken'> {
  const config = { ...options }
  const check = () => {
    if (config.enabled !== true || !callbackValid(config.callbackUrl) || config.authorizationScope !== SCOPE
      || !text(config.clientSecret, 4096)) throw new CustomerHttpHeld('not_attempted')
  }
  const send = async (grantType: 'authorization_code' | 'refresh_token', fields: Record<string, string>): Promise<TokenResponse> => {
    check()
    // RFC 6749 §2.3.1: form-encode each Basic credential before joining with ':';
    // the client secret is never sent in the form body or returned to a browser.
    const formEncode = (s: string) => new URLSearchParams({ v: s }).toString().slice(2)
    const auth = Buffer.from(`${formEncode(STAGING_CUSTOMER_CLIENT_ID)}:${formEncode(config.clientSecret!)}`).toString('base64')
    const body = new URLSearchParams({ grant_type: grantType, client_id: STAGING_CUSTOMER_CLIENT_ID, ...fields }).toString()
    const { data } = await jsonRequest(config, TOKEN_URL, 'POST', { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-store' }, body)
    try {
      if (!object(data) || Object.keys(data).some(k => !['access_token', 'refresh_token', 'id_token', 'token_type', 'expires_in', 'scope'].includes(k))
        || !text(data.access_token, 32_768)
        || (data.refresh_token === undefined ? grantType !== 'refresh_token' || !text(fields.refresh_token, 32_768) : !text(data.refresh_token, 32_768))
        || (data.id_token === undefined ? grantType === 'authorization_code' : !text(data.id_token, 32_768))
        || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer'
        || !Number.isSafeInteger(data.expires_in) || (data.expires_in as number) <= 0 || (data.expires_in as number) > 86_400
        || (data.scope !== undefined && !exactScope(data.scope))) throw new Error('invalid token response')
      return { accessToken: data.access_token, refreshToken: (data.refresh_token ?? fields.refresh_token) as string, ...(data.id_token ? { idToken: data.id_token as string } : {}),
        tokenType: 'Bearer', expiresIn: data.expires_in as number, scope: SCOPE,
        // RFC 6749 §5.1 omission means unchanged, and §6 forbids refresh scope
        // expansion. Refresh requests explicitly send the same original set.
        scopeProvenance: { source: data.scope === undefined ? 'unchanged_request' : 'token_response', requestedScope: config.authorizationScope, grantType },
        refreshTokenProvenance: data.refresh_token === undefined
          ? { source: 'retained_original', grantType: 'refresh_token', previousTokenHash: createHash('sha256').update(fields.refresh_token).digest('hex') }
          : { source: 'token_response', grantType } }
    } catch { throw new CustomerHttpHeld('uncertain') }
  }
  return Object.freeze({
    async exchangeCode(input) {
      check()
      if (!input || input.endpoint !== TOKEN_URL || input.clientId !== STAGING_CUSTOMER_CLIENT_ID || input.redirectUri !== config.callbackUrl
        || !text(input.code, 4096) || !/^[A-Za-z0-9_-]{43}$/.test(input.verifier)) throw new CustomerHttpHeld('not_attempted')
      return send('authorization_code', { code: input.code, code_verifier: input.verifier, redirect_uri: config.callbackUrl })
    },
    async refreshToken(input) {
      check()
      if (!input || input.endpoint !== TOKEN_URL || input.clientId !== STAGING_CUSTOMER_CLIENT_ID || !text(input.refreshToken, 32_768)) throw new CustomerHttpHeld('not_attempted')
      return send('refresh_token', { refresh_token: input.refreshToken, scope: SCOPE })
    },
  })
}

type KeySnapshot = { sourceUrl: string; verifiedAt: number; expiresAt: number; jwks: JSONWebKeySet }
type LoadedKeys = { snapshot: KeySnapshot; cacheable: boolean }
function publicKeys(value: unknown): JSONWebKeySet {
  if (!object(value) || Object.keys(value).some(k => k !== 'keys') || !Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 20) throw new Error('invalid keys')
  const keys = value.keys.map(k => {
    if (!object(k) || k.kty !== 'RSA' || !text(k.kid, 128) || (k.alg !== undefined && k.alg !== 'RS256') || (k.use !== undefined && k.use !== 'sig')
      || !text(k.n, 1400) || !text(k.e, 16) || !/^[A-Za-z0-9_-]+$/.test(k.n) || !/^[A-Za-z0-9_-]+$/.test(k.e)
      || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(p => p in k)
      || (k.key_ops !== undefined && (!Array.isArray(k.key_ops) || k.key_ops.length !== 1 || k.key_ops[0] !== 'verify'))) throw new Error('invalid public key')
    const n = Buffer.from(k.n, 'base64url'), e = Buffer.from(k.e, 'base64url')
    if (n.length < 256 || n.length > 1024 || n[0] < 128 || n.toString('base64url') !== k.n || e.length < 1 || e.length > 6
      || e[0] === 0 || !(e[e.length - 1] & 1) || (e.length === 1 && e[0] < 3) || e.toString('base64url') !== k.e) throw new Error('invalid RSA values')
    // Certificates/extension metadata never become keys or discovery URLs.
    return { kty: 'RSA', kid: k.kid, alg: 'RS256', use: 'sig', n: k.n, e: k.e }
  })
  if (new Set(keys.map(k => k.kid)).size !== keys.length) throw new Error('duplicate kid')
  return { keys }
}
function freshness(headers: Map<string, string>, now: number): { lifetime: number; cacheable: boolean } {
  const directives = (headers.get('cache-control') ?? '').toLowerCase().split(',').map(s => s.trim())
  const maxAge = directives.filter(s => s.startsWith('max-age'))
  if (maxAge.length > 1 || (maxAge.length === 1 && !/^max-age="?\d+"?$/.test(maxAge[0]))) throw new Error('invalid freshness')
  let age = 0
  if (headers.has('age')) {
    if (!/^\d+$/.test(headers.get('age')!)) throw new Error('invalid age')
    age = Number(headers.get('age')) * 1000
  }
  if (headers.has('date')) {
    const date = Date.parse(headers.get('date')!); if (!Number.isFinite(date) || date > now + 5000) throw new Error('invalid date')
    age = Math.max(age, now - date)
  }
  const specified = maxAge.length ? Number(maxAge[0].split('=')[1].replaceAll('"', '')) * 1000 : MAX_AGE_MS
  const cacheable = specified !== 0 && !directives.some(s => s === 'no-store' || s === 'no-cache' || s.startsWith('no-cache='))
  // A fresh no-cache/zero-age 200 may authenticate this verification, but is
  // never retained for a subsequent call. Our GET requests revalidation.
  const lifetime = cacheable ? Math.min(MAX_AGE_MS, specified) - age : Math.min(5000, MAX_AGE_MS - age)
  if (!Number.isFinite(specified) || !Number.isFinite(lifetime) || lifetime <= 0) throw new Error('stale keys')
  return { lifetime, cacheable }
}

/** Public key loader, disabled by default. It fetches only the already verified
 * staging JWKS URL. No token-provided jku/x5u/discovery URL is ever followed.
 * Cache/rotation state is process-local and contains public keys only.
 */
export function createShopifyCustomerJwksLoader(options: HttpOptions & { now?: () => number } = {}) {
  const config = { ...options }, now = config.now ?? Date.now
  let cached: LoadedKeys | null = null, inFlight: Promise<LoadedKeys | null> | null = null, lastAttempt = 0, retryAfter = 0
  const load = async (unknownKey = false): Promise<LoadedKeys | null> => {
    const time = now()
    if (config.enabled !== true || !clock(time)) return null
    if (inFlight) return inFlight
    if (!unknownKey && cached && time >= cached.snapshot.verifiedAt && time < cached.snapshot.expiresAt) return cached
    if (time < retryAfter || (lastAttempt && (time < lastAttempt || (unknownKey && time - lastAttempt < ROTATION_COOLDOWN_MS)))) return null
    lastAttempt = time
    inFlight = (async () => {
      try {
        const response = await jsonRequest(config, JWKS_URL, 'GET', { 'cache-control': 'no-cache' }, null), receivedAt = now()
        if (!clock(receivedAt) || receivedAt < time) throw new Error('invalid time')
        const { lifetime, cacheable } = freshness(response.headers, receivedAt), jwks = publicKeys(response.data)
        const loaded = { snapshot: { sourceUrl: JWKS_URL, verifiedAt: receivedAt, expiresAt: receivedAt + lifetime, jwks }, cacheable }
        cached = cacheable ? loaded : null
        return loaded
      } catch { cached = null; retryAfter = now() + ROTATION_COOLDOWN_MS; return null }
      finally { inFlight = null }
    })()
    return inFlight
  }
  return Object.freeze({
    async refreshPublicKeys(): Promise<{ status: 'ready' | 'held'; expiresAt?: number; keyCount?: number }> {
      try {
        const loaded = await load()
        return loaded ? { status: 'ready', expiresAt: loaded.snapshot.expiresAt, keyCount: loaded.snapshot.jwks.keys.length } : { status: 'held' }
      } catch { return { status: 'held' } }
    },
    async verifyIdToken(token: string, expected: IdVerification): Promise<VerifiedId | null> {
      try {
        if (!text(token, 32_768) || expected.issuer !== STAGING_ISSUER || expected.audience !== STAGING_CUSTOMER_CLIENT_ID
          || expected.jwksUri !== JWKS_URL || !clock(expected.now) || Math.abs(expected.now - now()) > 5000) return null
        const header = decodeProtectedHeader(token)
        if (header.alg !== 'RS256' || !text(header.kid, 128) || header.jku || header.x5u || header.jwk || header.x5c) return null
        let loaded = await load()
        if (!loaded) return null
        if (!loaded.snapshot.jwks.keys.some(k => k.kid === header.kid)) loaded = await load(true)
        if (!loaded || !loaded.snapshot.jwks.keys.some(k => k.kid === header.kid)) return null
        // Evaluate expiry at actual verification time after the network await.
        return createLocalCustomerIdVerifier(loaded.snapshot)(token, { ...expected, now: now() })
      } catch { return null }
    },
  })
}
