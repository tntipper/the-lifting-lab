// Node/server transport only. Default disabled; no routes or provider activation.
import { Agent, request } from 'node:https'
import { STAGING_SUPABASE_ISSUER } from './customer-connection'
import { SUBJECT_BROKER_CALLBACK, SUBJECT_BROKER_CLIENT_ID, SUBJECT_BROKER_SCOPE } from './customer-subject-broker'

/** Candidate identifiers, not evidence of a registered provider or route. */
export const SUBJECT_BROKER_PROVIDER = 'custom:tll-staging-subject-broker-v1'
export const SUBJECT_BROKER_AUTHORIZE_PATH = '/auth/customer/authorize'
export const CUSTOMER_APPLICATION_CALLBACK_PATH = '/auth/customer/callback'
const AUTHORIZE = `${STAGING_SUPABASE_ISSUER}/authorize`
const LINK = `${STAGING_SUPABASE_ISSUER}/user/identities/authorize`
const MAX_BYTES = 32_768, MAX_HEADERS = 16_384, MAX_URL = 8192
const privateAgent = new Agent({ keepAlive: false, rejectUnauthorized: true })
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) && Buffer.from(v, 'base64url').toString('base64url') === v
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const originValid = (v: unknown): v is string => typeof v === 'string' && v.length <= 253
  && /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(v) && new URL(v).origin === v

export class SupabaseAdmissionHeld extends Error {
  readonly code = 'SUPABASE_ADMISSION_HELD'
  readonly outcome: 'not_attempted' | 'uncertain'
  constructor(outcome: 'not_attempted' | 'uncertain') {
    super('Customer authorization admission held'); this.name = 'SupabaseAdmissionHeld'; this.outcome = outcome
  }
}
/** Trusted offline/server injection only. Never derive transport from a request. */
export type SupabaseAdmissionTransport = (input: {
  url: string; method: 'GET'; headers: Readonly<Record<string, string>>; signal: AbortSignal; maxBytes: number
}) => Promise<{ url: string; status: number; headers: readonly (readonly [string, string])[]; body: Uint8Array }>

const nodeHttps: SupabaseAdmissionTransport = input => new Promise((resolve, reject) => {
  const url = new URL(input.url)
  if (input.method !== 'GET' || ![AUTHORIZE, LINK].includes(`${url.origin}${url.pathname}`) || url.username || url.password || url.hash) {
    reject(new SupabaseAdmissionHeld('not_attempted')); return
  }
  const req = request(input.url, { method: 'GET', headers: input.headers, agent: privateAgent, rejectUnauthorized: true,
    signal: input.signal, maxHeaderSize: MAX_HEADERS }, res => {
    const chunks: Buffer[] = []; let size = 0
    const fail = () => { res.destroy(); reject(new SupabaseAdmissionHeld('uncertain')) }
    // Node HTTPS does not follow redirects, inherit cookies or decompress bodies.
    if (res.statusCode !== (url.pathname.endsWith('/identities/authorize') ? 200 : 302)
      || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) { fail(); return }
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
  req.on('error', () => reject(new SupabaseAdmissionHeld('uncertain')))
  req.end()
})

/** Only security-relevant fields survive projection. Unknown OAuth extension
 * parameters are ignored, never echoed to the browser or used as authority. */
function brokerUrl(raw: unknown, origin: string, applicationChallenge: string, migration: boolean) {
  if (typeof raw !== 'string' || raw.length > MAX_URL || raw.includes('#') || /[\x00-\x20\x7f]/.test(raw) || /%(?![0-9a-f]{2})/i.test(raw)) throw new Error('invalid URL')
  const url = new URL(raw)
  if (url.href !== raw || url.origin !== origin || url.pathname !== SUBJECT_BROKER_AUTHORIZE_PATH
    || url.username || url.password || url.port || url.hash || !url.search) throw new Error('invalid destination')
  const seen = new Set<string>()
  for (const part of url.search.slice(1).split('&')) {
    // Decode explicitly: URLSearchParams alone replaces malformed UTF-8.
    const split = part.indexOf('='), key = decodeURIComponent((split < 0 ? part : part.slice(0, split)).replaceAll('+', ' '))
    const value = decodeURIComponent((split < 0 ? '' : part.slice(split + 1)).replaceAll('+', ' ')), lower = key.toLowerCase()
    if (!key || seen.has(lower) || /[\x00-\x1f\x7f]/.test(key + value)) throw new Error('ambiguous query')
    seen.add(lower)
  }
  const q = url.searchParams
  if (q.get('response_type') !== 'code' || q.get('client_id') !== SUBJECT_BROKER_CLIENT_ID || q.get('redirect_uri') !== SUBJECT_BROKER_CALLBACK
    || q.get('scope') !== SUBJECT_BROKER_SCOPE || !uuid(q.get('state')) || q.get('code_challenge_method') !== 'S256'
    || !opaque(q.get('code_challenge')) || q.get('code_challenge') === applicationChallenge) throw new Error('invalid binding')
  if (['error', 'error_description', 'error_uri', 'code', 'access_token', 'refresh_token', 'id_token', 'client_secret', 'authorization'].some(k => seen.has(k))) throw new Error('unexpected credential')
  const expected = { provider: SUBJECT_BROKER_PROVIDER, scopes: SUBJECT_BROKER_SCOPE,
    redirect_to: `${origin}${CUSTOMER_APPLICATION_CALLBACK_PATH}`, skip_http_redirect: migration ? 'true' : null }
  for (const [key, value] of Object.entries(expected)) if (seen.has(key) && (value === null || q.get(key) !== value)) throw new Error('invalid extension')
  const query = new URLSearchParams({ response_type: 'code', client_id: SUBJECT_BROKER_CLIENT_ID, redirect_uri: SUBJECT_BROKER_CALLBACK,
    scope: SUBJECT_BROKER_SCOPE, state: q.get('state')!, code_challenge_method: 'S256', code_challenge: q.get('code_challenge')! }).toString()
  return Object.freeze({ authorizationUrl: `${origin}${SUBJECT_BROKER_AUTHORIZE_PATH}?${query}`, authorizationQuery: query })
}

function responseHeaders(response: Awaited<ReturnType<SupabaseAdmissionTransport>>, requested: string, migration: boolean) {
  if (!response || response.url !== requested || response.status !== (migration ? 200 : 302) || !Array.isArray(response.headers)
    || !(response.body instanceof Uint8Array) || response.body.byteLength > MAX_BYTES) throw new Error('invalid response')
  const h = new Map<string, string>(); let bytes = 0
  for (const pair of response.headers) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') throw new Error('invalid header')
    const [name, value] = pair, key = name.toLowerCase(); bytes += Buffer.byteLength(name) + Buffer.byteLength(value)
    if (bytes > MAX_HEADERS || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key) || /[\x00-\x08\x0a-\x1f\x7f]/.test(value)) throw new Error('invalid header')
    if (h.has(key) && ['location', 'content-type', 'content-length', 'content-encoding', 'transfer-encoding'].includes(key)) throw new Error('duplicate header')
    h.set(key, value)
  }
  if (h.has('content-encoding') && h.get('content-encoding') !== 'identity') throw new Error('encoded response')
  if (h.has('content-length') && (!/^\d+$/.test(h.get('content-length')!) || Number(h.get('content-length')) !== response.body.byteLength || h.has('transfer-encoding'))) throw new Error('invalid length')
  return h
}

/** Real admission primitive; the caller MUST commit and claim durable intent
 * before invoking it. The GET allocates upstream state. No retries, persistence,
 * session verification, registration or browser redirect are performed here.
 * Migration accessToken is the exact independently verified SSR session token,
 * never a browser input. Parsing its shape does not authenticate it.
 */
export function createSupabaseAuthorizationAdmission(options: {
  enabled?: boolean; applicationOrigin: string; publishableKey?: string
  transport?: SupabaseAdmissionTransport; timeoutMs?: number
}) {
  const { enabled, applicationOrigin, publishableKey } = options
  const transport = options.transport ?? nodeHttps, timeoutMs = options.timeoutMs ?? 5000
  const send = async (applicationChallenge: unknown, accessToken?: unknown) => {
    const migration = accessToken !== undefined
    if (enabled !== true || typeof window !== 'undefined' || !originValid(applicationOrigin) || !opaque(applicationChallenge)
      || typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publishableKey)
      || !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 10_000
      || (migration && (typeof accessToken !== 'string' || accessToken.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)))) throw new SupabaseAdmissionHeld('not_attempted')
    const query = new URLSearchParams({ provider: SUBJECT_BROKER_PROVIDER, redirect_to: `${applicationOrigin}${CUSTOMER_APPLICATION_CALLBACK_PATH}`,
      scopes: SUBJECT_BROKER_SCOPE, code_challenge: applicationChallenge, code_challenge_method: 's256' })
    if (migration) query.set('skip_http_redirect', 'true')
    const url = `${migration ? LINK : AUTHORIZE}?${query}`, controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => transport({ url, method: 'GET', signal: controller.signal, maxBytes: MAX_BYTES,
          headers: Object.freeze({ accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store',
            apikey: publishableKey, ...(migration ? { authorization: `Bearer ${accessToken}` } : {}) }) })),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new SupabaseAdmissionHeld('uncertain')) }, timeoutMs) }),
      ])
      if (controller.signal.aborted) throw new Error('aborted')
      const h = responseHeaders(response, url, migration)
      let returned: unknown = h.get('location')
      if (migration) {
        if (h.has('location') || !/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(h.get('content-type') ?? '')) throw new Error('invalid representation')
        const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))
        if (!object(data) || ['error', 'error_code', 'error_description', 'error_uri'].some(k => Object.hasOwn(data, k))) throw new Error('provider error')
        returned = data.url
      }
      return brokerUrl(returned, applicationOrigin, applicationChallenge, migration)
    } catch { throw new SupabaseAdmissionHeld('uncertain') }
    finally { clearTimeout(timer); controller.abort() }
  }
  return Object.freeze({
    authorizeSignIn(input: { applicationPkceChallenge: string }) { return send(input?.applicationPkceChallenge) },
    authorizeMigration(input: { applicationPkceChallenge: string; accessToken: string }) {
      // An absent migration token must never silently choose the sign-in path.
      return send(input?.applicationPkceChallenge, input?.accessToken ?? null)
    },
  })
}
