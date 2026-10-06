// Node/server only. No routes, SDK session storage, cookies or reconciliation.
import { Agent, request } from 'node:https'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { decodeJwt } from 'jose'
import { STAGING_SUPABASE_ISSUER, type SupabaseSessionProof } from './customer-connection'
import { SUBJECT_BROKER_PROVIDER } from './supabase-authorization-admission'
import { createStagingSupabaseSessionReader } from './supabase-session-proof'

const TOKEN_URL = `${STAGING_SUPABASE_ISSUER}/token?grant_type=pkce`, USER_URL = `${STAGING_SUPABASE_ISSUER}/user`
const MAX_BYTES = 131_072, MAX_HEADERS = 16_384, MAX_LIFETIME_MS = 86_400_000
const privateAgent = new Agent({ keepAlive: false, rejectUnauthorized: true })
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) && Buffer.from(v, 'base64url').toString('base64url') === v
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x20\x7f]/.test(v)
const clock = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0
const seconds = (v: unknown): v is number => clock(v) && Number.isSafeInteger(v * 1000)

export class SupabaseFinalExchangeHeld extends Error {
  readonly code = 'SUPABASE_FINAL_EXCHANGE_HELD'
  readonly outcome: 'not_attempted' | 'uncertain'
  constructor(outcome: 'not_attempted' | 'uncertain') {
    super('Customer final session exchange held'); this.name = 'SupabaseFinalExchangeHeld'; this.outcome = outcome
  }
}
/** Trusted offline injection; no browser-controlled transport/host/TLS options. */
export type SupabaseFinalExchangeTransport = (input: {
  url: string; method: 'GET' | 'POST'; headers: Readonly<Record<string, string>>
  body: string | null; signal: AbortSignal; maxBytes: number
}) => Promise<{ url: string; status: number; headers: readonly (readonly [string, string])[]; body: Uint8Array }>
export type FinalExchangeBinding = {
  authCode: string; applicationVerifier: string; applicationPkceChallenge: string; reservedSubject: string
}
/** Private provisional material only. Never serialize to a browser, log, cookie
 * or public table. Reconciliation and encrypted persistence are separate gates. */
export type ProvisionalSupabaseSession = {
  kind: 'private_provisional'
  session: { accessToken: string; refreshToken: string; tokenType: 'Bearer'; expiresAt: number }
  proof: SupabaseSessionProof
  identity: { provider: typeof SUBJECT_BROKER_PROVIDER; subject: string; identityId: string; userId: string }
}

const nodeHttps: SupabaseFinalExchangeTransport = input => new Promise((resolve, reject) => {
  if (!((input.url === TOKEN_URL && input.method === 'POST') || (input.url === USER_URL && input.method === 'GET'))) {
    reject(new SupabaseFinalExchangeHeld('not_attempted')); return
  }
  const req = request(input.url, { method: input.method, headers: input.headers, agent: privateAgent, rejectUnauthorized: true,
    signal: input.signal, maxHeaderSize: MAX_HEADERS }, res => {
    const chunks: Buffer[] = []; let size = 0
    const fail = () => { res.destroy(); reject(new SupabaseFinalExchangeHeld('uncertain')) }
    // Node HTTPS neither follows a redirect nor inherits cookies/decompresses.
    if (res.statusCode !== 200 || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) { fail(); return }
    res.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > input.maxBytes) { fail(); return }
      chunks.push(chunk)
    })
    res.once('error', fail); res.once('aborted', fail)
    res.once('end', () => {
      if (!res.complete || input.signal.aborted) { fail(); return }
      const headers: [string, string][] = []
      for (let i = 0; i < res.rawHeaders.length; i += 2) headers.push([res.rawHeaders[i], res.rawHeaders[i + 1]])
      resolve({ url: input.url, status: res.statusCode!, headers, body: Buffer.concat(chunks) })
    })
  })
  req.on('error', () => reject(new SupabaseFinalExchangeHeld('uncertain')))
  req.end(input.body ?? undefined)
})

function jsonResponse(response: Awaited<ReturnType<SupabaseFinalExchangeTransport>>, url: string) {
  if (!response || response.url !== url || response.status !== 200 || !Array.isArray(response.headers)
    || !(response.body instanceof Uint8Array) || response.body.byteLength === 0 || response.body.byteLength > MAX_BYTES) throw new Error('invalid response')
  const headers = new Map<string, string>(); let bytes = 0
  for (const pair of response.headers) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') throw new Error('invalid header')
    const [name, value] = pair, key = name.toLowerCase(); bytes += Buffer.byteLength(name) + Buffer.byteLength(value)
    if (bytes > MAX_HEADERS || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key) || /[\x00-\x08\x0a-\x1f\x7f]/.test(value)) throw new Error('invalid header')
    if (headers.has(key) && ['content-type', 'content-length', 'content-encoding', 'transfer-encoding', 'location'].includes(key)) throw new Error('duplicate header')
    headers.set(key, value)
  }
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(headers.get('content-type') ?? '') || headers.has('location')
    || (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity')) throw new Error('invalid representation')
  const length = headers.get('content-length')
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) !== response.body.byteLength || headers.has('transfer-encoding'))) throw new Error('invalid length')
  const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))
  if (!object(data) || ['error', 'error_code', 'error_description', 'error_uri'].some(k => Object.hasOwn(data, k))) throw new Error('provider error')
  return data
}

function exactIdentity(user: Record<string, unknown>, subject: string, proof: SupabaseSessionProof) {
  if (user.id !== proof.userId || !Array.isArray(user.identities) || user.identities.length < 1 || user.identities.length > 64) throw new Error('invalid identities')
  const ids = new Set<string>(); let matched: ProvisionalSupabaseSession['identity'] | undefined
  for (const identity of user.identities) {
    // Identity rows are authoritative; identity_data/email/app_metadata are not.
    if (!object(identity) || !uuid(identity.identity_id) || ids.has(identity.identity_id) || identity.user_id !== proof.userId
      || !text(identity.provider, 256) || !text(identity.id, 512)) throw new Error('invalid identity')
    ids.add(identity.identity_id)
    if (identity.provider === SUBJECT_BROKER_PROVIDER) {
      if (matched || identity.id !== subject) throw new Error('conflicting broker identity')
      matched = { provider: SUBJECT_BROKER_PROVIDER, subject, identityId: identity.identity_id, userId: proof.userId }
    }
  }
  if (!matched) throw new Error('missing broker identity')
  return Object.freeze(matched)
}

/** Call only after an acknowledged durable final-exchange claim. This primitive
 * neither supplies that claim nor enforces one-use across calls/processes.
 * The POST consumes upstream flow state; all subsequent failures are uncertain.
 * One total deadline covers POST and the same authenticated GET/user used by the
 * unchanged session reader. No SDK, token refresh or browser persistence exists.
 */
export function createSupabaseFinalExchange(options: {
  enabled?: boolean; publishableKey?: string; timeoutMs?: number
  transport?: SupabaseFinalExchangeTransport; now?: () => number
}) {
  const { enabled, publishableKey } = options, timeoutMs = options.timeoutMs ?? 5000
  const transport = options.transport ?? nodeHttps, now = options.now ?? Date.now
  const exchange = async (input: FinalExchangeBinding, migrationUser: unknown, migration: boolean): Promise<ProvisionalSupabaseSession> => {
    let startedAt: number
    try {
      startedAt = now()
      if (enabled !== true || typeof window !== 'undefined' || !clock(startedAt) || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000
        || typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publishableKey)
        || !object(input) || Object.keys(input).some(k => !['authCode', 'applicationVerifier', 'applicationPkceChallenge', 'reservedSubject', ...(migration ? ['originalUserId'] : [])].includes(k))
        || !uuid(input.authCode) || !opaque(input.applicationVerifier) || !opaque(input.applicationPkceChallenge)
        || createHash('sha256').update(input.applicationVerifier).digest('base64url') !== input.applicationPkceChallenge
        || typeof input.reservedSubject !== 'string' || !input.reservedSubject.startsWith('tllb_') || !opaque(input.reservedSubject.slice(5))
        || (migration && !uuid(migrationUser))) throw new Error('invalid request')
    } catch { throw new SupabaseFinalExchangeHeld('not_attempted') }
    // Capture all retained fields before awaiting; mutable input is not authority.
    const body = JSON.stringify({ auth_code: input.authCode, code_verifier: input.applicationVerifier }), subject = input.reservedSubject
    const controller = new AbortController(), deadline = performance.now() + timeoutMs
    let timer: ReturnType<typeof setTimeout> | undefined
    const checkDeadline = () => {
      if (controller.signal.aborted || performance.now() >= deadline) throw new Error('deadline')
    }
    const run = async (): Promise<ProvisionalSupabaseSession> => {
      checkDeadline()
      const response = await transport({ url: TOKEN_URL, method: 'POST', body, signal: controller.signal, maxBytes: MAX_BYTES,
        headers: Object.freeze({ accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store', apikey: publishableKey! }) })
      checkDeadline()
      const data = jsonResponse(response, TOKEN_URL)
      if (!text(data.access_token, 16_384) || !text(data.refresh_token, 16_384) || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer'
        || !seconds(data.expires_at) || !clock(data.expires_in) || data.expires_in > MAX_LIFETIME_MS / 1000
        || data.expires_at * 1000 <= startedAt || data.expires_at * 1000 > startedAt + MAX_LIFETIME_MS + timeoutMs) throw new Error('invalid token response')
      const accessToken = data.access_token, refreshToken = data.refresh_token, expiresAt = data.expires_at * 1000
      const remaining = Math.floor(deadline - performance.now())
      if (remaining < 50) throw new Error('insufficient verification time')
      let authoritativeUser: Record<string, unknown> | undefined
      const reader = createStagingSupabaseSessionReader({ enabled: true, publishableKey, now, timeoutMs: remaining, readAccessToken: async () => accessToken,
        transport: async request => {
          checkDeadline()
          const received = await transport({ ...request, body: null, signal: AbortSignal.any([controller.signal, request.signal]) })
          checkDeadline()
          // Own the bytes inspected by both paths; an injected transport cannot
          // mutate its original response after the reader authenticates it.
          if (!received || !Array.isArray(received.headers) || !(received.body instanceof Uint8Array) || received.body.byteLength > MAX_BYTES) throw new Error('invalid response')
          const snapshot = { ...received, headers: received.headers.map(p => [...p] as [string, string]), body: Buffer.from(received.body) }
          authoritativeUser = jsonResponse(snapshot, USER_URL)
          return snapshot
        } })
      const proof = await reader.currentSession()
      checkDeadline()
      const finishedAt = now()
      if (!proof || !authoritativeUser || !clock(finishedAt) || finishedAt < startedAt || finishedAt - startedAt > timeoutMs
        || proof.checkedAt > finishedAt || proof.expiresAt <= finishedAt || proof.expiresAt !== expiresAt
        || (migration && proof.userId !== migrationUser)) throw new Error('unverified session')
      // These claims are interpreted only AFTER exact-token /user verification.
      // The pinned external PKCE flow issues an OAuth-authenticated session.
      const claims = decodeJwt(accessToken), amr = claims.amr
      const oauth = Array.isArray(amr) ? amr.find(v => object(v) && v.method === 'oauth') : undefined
      if (!object(oauth) || !seconds(oauth.timestamp) || oauth.timestamp * 1000 !== proof.authenticatedAt
        || finishedAt - proof.authenticatedAt >= 300_000) throw new Error('unexpected authentication method')
      const identity = exactIdentity(authoritativeUser, subject, proof)
      checkDeadline()
      // Whitelist projection strips provider_token/provider_refresh_token,
      // user/contact/metadata/extension fields and raw HTTP headers entirely.
      return Object.freeze({ kind: 'private_provisional', session: Object.freeze({ accessToken, refreshToken, tokenType: 'Bearer', expiresAt }), proof, identity })
    }
    try {
      return await Promise.race([run(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new SupabaseFinalExchangeHeld('uncertain')) }, timeoutMs)
      })])
    } catch { throw new SupabaseFinalExchangeHeld('uncertain') }
    finally { clearTimeout(timer); controller.abort() }
  }
  return Object.freeze({
    exchangeSignIn(input: FinalExchangeBinding) { return exchange(input, null, false) },
    exchangeMigration(input: FinalExchangeBinding & { originalUserId: string }) { return exchange(input, input?.originalUserId, true) },
  })
}
