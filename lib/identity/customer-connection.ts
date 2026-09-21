// Node/server domain only. No route, provider activation, HTTP client or durable
// repository is installed by this foundation. Never import into a client bundle.
import { createHash, randomBytes, randomUUID } from 'node:crypto'

export const CUSTOMER_CONNECTION_LIVE_ENABLED = false
export const STAGING_SHOP_ID = '107532616020'
// Public Optimus TLL Customer Account app client (Dev Dashboard). Not a secret.
export const STAGING_CUSTOMER_CLIENT_ID = '63f474eda69ec32778ce2a99e8c1114f'
export const STAGING_ISSUER = `https://shopify.com/authentication/${STAGING_SHOP_ID}`
export const STAGING_DISCOVERY = 'https://tll-integration-staging.myshopify.com/.well-known/openid-configuration'
export const STAGING_SUPABASE_ISSUER = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
// OAuth authorize/token scope string Shopify Customer Account still documents.
// Dev Dashboard app access scopes (customer_read_customers / customer_read_orders)
// are separate shop-side permissions — not substitutes for this OIDC triad.
// Token adapters fail closed on exact set equality with this list.
export const CUSTOMER_SCOPES = Object.freeze(['openid', 'email', 'customer-account-api:full'])
const MAX_PROOF_AGE_MS = 5 * 60_000
const ATTEMPT_TTL_MS = 5 * 60_000
const REFRESH_LEASE_MS = 60_000

export type ConnectionConfig = {
  shopId: string; issuer: string; discoveryUrl: string; authorizationEndpoint: string
  tokenEndpoint: string; jwksUri: string; logoutEndpoint: string; clientId: string
  callbackUrl: string; supabaseIssuer: string
  verification: { evidenceId: string; configHash: string; verifiedAt: number; expiresAt: number } | null
}
/** Operator evidence, never a caller-supplied approval flag. Times are epoch ms. */
export function connectionConfigHash(config: Omit<ConnectionConfig, 'verification'>): string {
  return hash(JSON.stringify([config.shopId, config.issuer, config.discoveryUrl, config.authorizationEndpoint,
    config.tokenEndpoint, config.jwksUri, config.logoutEndpoint, config.clientId, config.callbackUrl, config.supabaseIssuer]))
}
/** Must be supplied by a server adapter that verifies token AND current session
 * revocation. authenticatedAt is a real login/reauthentication time, never iat
 * from an automatically refreshed JWT or a browser getSession result. */
export type SupabaseSessionProof = {
  userId: string; sessionId: string; issuer: string; audience: 'authenticated'
  authenticatedAt: number; expiresAt: number; checkedAt: number; anonymous: false
}
export type Owner = { userId: string; sessionId: string }
export type ConnectAttempt = {
  id: string; stateHash: string; owner: Owner; configHash: string; shopId: string
  callbackUrl: string; nonce: string; verifier: string; createdAt: number; expiresAt: number
}
export type TokenResponse = {
  accessToken: string; refreshToken: string; idToken?: string; tokenType: 'Bearer'
  expiresIn: number; scope: string
  scopeProvenance?: { source: 'token_response' | 'unchanged_request'; requestedScope: string; grantType: 'authorization_code' | 'refresh_token' }
  refreshTokenProvenance?: { source: 'token_response'; grantType: 'authorization_code' | 'refresh_token' }
    | { source: 'retained_original'; grantType: 'refresh_token'; previousTokenHash: string }
}
/** Private vault material. No browser DTO, log, cookie or public-table column. */
export type VaultTokens = {
  accessToken: string; refreshToken: string; idToken: string; accessExpiresAt: number
  scopes: readonly string[]; originalNonce: string; scopeProvenance: TokenResponse['scopeProvenance'] | null
  refreshTokenProvenance: TokenResponse['refreshTokenProvenance'] | null
}
export type SubjectBinding = { shopId: string; issuer: string; subject: string; userId: string }
export type VerifiedId = { issuer: string; subject: string; audience: string; nonce: string | null; issuedAt: number; expiresAt: number }
export type IdVerification = { issuer: string; audience: string; jwksUri: string; nonce: string | null; nonceOptional?: boolean; now: number }
export type AttemptClaim = { status: 'claimed'; attempt: ConnectAttempt; fence: string } | { status: 'rejected' }
export type RefreshClaim = {
  status: 'claimed'; connectionId: string; fence: string; binding: SubjectBinding
  configHash: string; tokens: VaultTokens; leaseExpiresAt: number
} | { status: 'rejected' }

/** Trusted private repository/vault boundary. Every successful return follows
 * committed atomic state changes. No implementation is included here.
 *
 * createAttempt reserves one pending operation per owner/shop and records the
 * current logout generation. claimAttempt checks exact owner/hash/time, moves
 * pending -> exchanging ONCE, and commits before exposing the verifier.
 * Exchanging is never reclaimed for another exchange after a crash/timeout.
 *
 * finishAttempt atomically checks fence+expiry+logout generation, reserves BOTH
 * unique (shop,issuer,subject) and (shop,userId), writes encrypted tokens and
 * finishes the attempt. Same exact binding may replace its tokens only while
 * no refresh is outstanding; different subjects/accounts are conflicts.
 *
 * claimRefresh checks owner/config, active state and no current attempt, commits
 * active -> refreshing with a monotonic fence and lease before exposing tokens.
 * Expired refreshing -> held, NEVER active/retry. finishRefresh requires current
 * fence, live lease and generation. hold methods invalidate same-fence active
 * results too (lost COMMIT acknowledgement); stale fences must not alter newer
 * state. Held tokens are inaccessible until explicit reauthentication.
 *
 * beginLogout atomically tombstones connection use, increments the owner/shop
 * generation, cancels pending/exchanging attempts and fences refreshes. It
 * retains only restricted logout-intent material; general vault reads must fail.
 * Repeated logout is idempotent and must not require deleted token material.
 * Bindings remain reserved; logout does not authorize an account merge/unlink.
 */
export interface CustomerConnectionRepository {
  createAttempt(attempt: ConnectAttempt): Promise<boolean>
  claimAttempt(stateHash: string, owner: Owner, configHash: string, now: number): Promise<AttemptClaim>
  finishAttempt(id: string, fence: string, binding: SubjectBinding, tokens: VaultTokens, now: number): Promise<{ status: 'connected'; connectionId: string } | { status: 'rejected' }>
  holdAttempt(id: string, fence: string): Promise<void>
  claimRefresh(connectionId: string, owner: Owner, configHash: string, now: number, leaseMs: number): Promise<RefreshClaim>
  finishRefresh(connectionId: string, fence: string, tokens: VaultTokens, now: number): Promise<boolean>
  holdRefresh(connectionId: string, fence: string): Promise<void>
  beginLogout(owner: Owner, shopId: string, now: number): Promise<{ status: 'local_revoked'; upstreamLogout: 'pending' | 'not_required' }>
}
export type ConnectionPorts = {
  repository: CustomerConnectionRepository
  currentSession(): Promise<SupabaseSessionProof | null>
  verifyIdToken(token: string, expected: IdVerification): Promise<VerifiedId | null>
  // Credentials are owned by a future bound confidential-client adapter, never
  // passed from a browser or included in config/results. No adapter is supplied.
  exchangeCode(input: { endpoint: string; clientId: string; code: string; verifier: string; redirectUri: string }): Promise<TokenResponse>
  refreshToken(input: { endpoint: string; clientId: string; refreshToken: string }): Promise<TokenResponse>
  now(): number
}
export type ConnectionResult = { status: 'disabled' | 'held' | 'connected' | 'refreshed' | 'logged_out'; code: string; connectionId?: string; upstreamLogout?: 'pending' | 'not_required'; liveEnabled: false }
type StartResult = ConnectionResult | { status: 'authorization_ready'; authorizationUrl: string; expiresAt: number; liveEnabled: false }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const time = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0
const text = (v: unknown, max = 32_768): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v && !/[\x00-\x20\x7f]/.test(v)
const ownerEquals = (a: Owner, b: Owner) => a.userId === b.userId && a.sessionId === b.sessionId
const held = (code: string): ConnectionResult => ({ status: 'held', code, liveEnabled: false })

function validConfig(c: ConnectionConfig, now: number): boolean {
  try {
    const v = c.verification, callback = new URL(c.callbackUrl)
    return time(now) && c.shopId === STAGING_SHOP_ID && c.issuer === STAGING_ISSUER
      && c.discoveryUrl === STAGING_DISCOVERY && c.authorizationEndpoint === `${STAGING_ISSUER}/oauth/authorize`
      && c.tokenEndpoint === `${STAGING_ISSUER}/oauth/token` && c.jwksUri === `${STAGING_ISSUER}/.well-known/jwks.json`
      && c.logoutEndpoint === `${STAGING_ISSUER}/logout` && c.supabaseIssuer === STAGING_SUPABASE_ISSUER
      && c.clientId === STAGING_CUSTOMER_CLIENT_ID && callback.protocol === 'https:' && callback.hostname.endsWith('.vercel.app')
      && callback.hostname !== 'vercel.app' && !callback.username && !callback.password && !callback.port
      && !callback.search && !callback.hash && callback.pathname === '/auth/shopify/callback'
      && callback.href === c.callbackUrl && !!v && text(v.evidenceId, 128)
      && v.configHash === connectionConfigHash(c) && time(v.verifiedAt) && v.verifiedAt <= now
      && time(v.expiresAt) && v.expiresAt > now && v.expiresAt > v.verifiedAt
  } catch { return false }
}
function validProof(p: SupabaseSessionProof | null, now: number, recent: boolean): p is SupabaseSessionProof {
  return !!p && time(now) && uuid(p.userId) && uuid(p.sessionId) && p.issuer === STAGING_SUPABASE_ISSUER
    && p.audience === 'authenticated' && p.anonymous === false && time(p.authenticatedAt)
    && p.authenticatedAt <= now && (!recent || now - p.authenticatedAt <= MAX_PROOF_AGE_MS)
    && time(p.expiresAt) && p.expiresAt > now && time(p.checkedAt) && p.checkedAt <= now && now - p.checkedAt <= 5_000
}
function validResponse(r: TokenResponse, now: number, requireId: boolean, originalRefreshToken?: string): boolean {
  return !!r && text(r.accessToken) && text(r.refreshToken) && (r.idToken === undefined ? !requireId : text(r.idToken))
    && r.tokenType === 'Bearer' && Number.isSafeInteger(r.expiresIn) && r.expiresIn > 0 && r.expiresIn <= 86_400
    && time(now + r.expiresIn * 1000) && typeof r.scope === 'string'
    && r.scope.split(' ').length === CUSTOMER_SCOPES.length
    && CUSTOMER_SCOPES.every(s => r.scope.split(' ').includes(s))
    && (r.scopeProvenance === undefined || (!!r.scopeProvenance
      && ['token_response', 'unchanged_request'].includes(r.scopeProvenance.source)
      && r.scopeProvenance.requestedScope === CUSTOMER_SCOPES.join(' ')
      && r.scopeProvenance.grantType === (requireId ? 'authorization_code' : 'refresh_token')))
    && (r.refreshTokenProvenance === undefined || (!!r.refreshTokenProvenance
      && r.refreshTokenProvenance.grantType === (requireId ? 'authorization_code' : 'refresh_token')
      && (r.refreshTokenProvenance.source === 'token_response' || (r.refreshTokenProvenance.source === 'retained_original'
        && !requireId && text(originalRefreshToken) && r.refreshToken === originalRefreshToken
        && r.refreshTokenProvenance.previousTokenHash === hash(originalRefreshToken)))))
}
function validId(id: VerifiedId | null, expected: IdVerification): id is VerifiedId {
  return !!id && id.issuer === expected.issuer && id.audience === expected.audience && (id.nonce === expected.nonce || (expected.nonceOptional === true && id.nonce === null))
    && text(id.subject, 256) && time(id.issuedAt) && id.issuedAt <= expected.now
    && time(id.expiresAt) && id.expiresAt > expected.now && id.expiresAt > id.issuedAt
}

/** Only synthetic execution exists. Setting liveEnabled:true cannot activate it.
 * Trusted ports are dependency injection, not a sandbox against malicious code.
 * The test repository is explicitly non-durable; production adapters are absent.
 */
export function createCustomerConnectionFoundation(input: { config?: ConnectionConfig; ports: ConnectionPorts; syntheticExecution?: boolean; liveEnabled?: boolean }) {
  const ports = input.ports
  let config: ConnectionConfig | null = null
  try { config = input.config ? structuredClone(input.config) : null } catch { /* invalid operator config remains held */ }
  const synthetic = input.syntheticExecution === true && input.liveEnabled !== true
  const configHash = config ? connectionConfigHash(config) : ''
  const gate = (): ConnectionResult | null => !synthetic
    ? { status: 'disabled', code: 'LIVE_EXECUTION_NOT_IMPLEMENTED', liveEnabled: false }
    : !config || !validConfig(config, ports.now()) ? held('VERIFIED_CONFIGURATION_REQUIRED') : null
  const expected = (nonce: string | null, nonceOptional = false): IdVerification => ({ issuer: config!.issuer, audience: config!.clientId, jwksUri: config!.jwksUri, nonce, nonceOptional, now: ports.now() })
  const checkSession = async (recent: boolean) => {
    const p = await ports.currentSession()
    return validProof(p, ports.now(), recent) ? structuredClone(p) : null
  }
  const sameSession = async (owner: Owner, recent: boolean) => { const p = await checkSession(recent); return !!p && ownerEquals(owner, p) }
  const bundle = (r: TokenResponse, receivedAt: number, idToken: string, originalNonce: string): VaultTokens => ({ accessToken: r.accessToken, refreshToken: r.refreshToken, idToken, originalNonce, accessExpiresAt: receivedAt + r.expiresIn * 1000, scopes: [...CUSTOMER_SCOPES],
    scopeProvenance: r.scopeProvenance ? structuredClone(r.scopeProvenance) : null, refreshTokenProvenance: r.refreshTokenProvenance ? structuredClone(r.refreshTokenProvenance) : null })
  return Object.freeze({
    liveEnabled: false as const,
    async start(): Promise<StartResult> {
      try {
        const blocked = gate(); if (blocked) return blocked
        const proof = await checkSession(true); if (!proof) return held('RECENT_SESSION_PROOF_REQUIRED')
        const changed = gate(); if (changed) return changed
        const now = ports.now(), state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url')
        const attempt: ConnectAttempt = { id: randomUUID(), stateHash: hash(state), owner: { userId: proof.userId, sessionId: proof.sessionId }, configHash,
          shopId: STAGING_SHOP_ID, callbackUrl: config!.callbackUrl, nonce: randomBytes(32).toString('base64url'), verifier, createdAt: now,
          expiresAt: Math.min(now + ATTEMPT_TTL_MS, proof.expiresAt, config!.verification!.expiresAt) }
        if (!await ports.repository.createAttempt(attempt)) return held('ATTEMPT_NOT_COMMITTED')
        const url = new URL(config!.authorizationEndpoint)
        url.search = new URLSearchParams({ client_id: config!.clientId, response_type: 'code', scope: CUSTOMER_SCOPES.join(' '),
          redirect_uri: config!.callbackUrl, state, nonce: attempt.nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString()
        return { status: 'authorization_ready', authorizationUrl: url.href, expiresAt: attempt.expiresAt, liveEnabled: false }
      } catch { return held('START_UNAVAILABLE') }
    },
    async complete(callbackUrl: string): Promise<ConnectionResult> {
      let claim: Extract<AttemptClaim, { status: 'claimed' }> | undefined
      try {
        const blocked = gate(); if (blocked) return blocked
        if (typeof callbackUrl !== 'string' || callbackUrl.length > 16_384) return held('INVALID_CALLBACK')
        const callback = new URL(callbackUrl), target = new URL(config!.callbackUrl)
        const params = callback.searchParams
        if (callback.origin !== target.origin || callback.pathname !== target.pathname || callback.username || callback.password || callback.hash
          || [...params.keys()].some(k => !['state', 'code', 'error', 'error_description'].includes(k)) || params.getAll('state').length !== 1
          || params.getAll('code').length > 1 || params.getAll('error').length > 1
          || params.getAll('error_description').length > 1 || (params.has('error_description') && !params.has('error'))
          || (!!params.get('code') === !!params.get('error')) || !/^[A-Za-z0-9_-]{43}$/.test(params.get('state') ?? '')) return held('INVALID_CALLBACK')
        const proof = await checkSession(true); if (!proof) return held('RECENT_SESSION_PROOF_REQUIRED')
        const result = await ports.repository.claimAttempt(hash(params.get('state')!), proof, configHash, ports.now())
        if (result.status !== 'claimed') return held('STATE_UNAVAILABLE')
        claim = result
        const a = claim.attempt
        if (!uuid(a.id) || !text(claim.fence, 128) || !ownerEquals(a.owner, proof) || a.stateHash !== hash(params.get('state')!)
          || a.configHash !== configHash || a.shopId !== STAGING_SHOP_ID || a.callbackUrl !== config!.callbackUrl
          || !time(a.createdAt) || a.createdAt > ports.now() || !time(a.expiresAt) || a.expiresAt <= ports.now()
          || a.expiresAt - a.createdAt > ATTEMPT_TTL_MS || !/^[A-Za-z0-9_-]{43}$/.test(a.verifier) || !/^[A-Za-z0-9_-]{43}$/.test(a.nonce)) throw new Error('invalid claim')
        if (params.has('error') || !text(params.get('code'), 4096)) throw new Error('cancelled or invalid code')
        // The one-use exchanging marker is committed before this call. Any
        // subsequent error/lost response requires reauthentication, not retry.
        const tokens = await ports.exchangeCode({ endpoint: config!.tokenEndpoint, clientId: config!.clientId, code: params.get('code')!, verifier: a.verifier, redirectUri: a.callbackUrl })
        const receivedAt = ports.now()
        if (!validResponse(tokens, receivedAt, true)) throw new Error('invalid token response')
        const exp = expected(a.nonce), id = await ports.verifyIdToken(tokens.idToken!, exp)
        if (!validId(id, exp) || !await sameSession(a.owner, true) || gate() || ports.now() >= a.expiresAt
          || ports.now() >= id.expiresAt || ports.now() >= receivedAt + tokens.expiresIn * 1000) throw new Error('invalid second proof')
        const binding = { shopId: STAGING_SHOP_ID, issuer: id.issuer, subject: id.subject, userId: a.owner.userId }
        const done = await ports.repository.finishAttempt(a.id, claim.fence, binding, bundle(tokens, receivedAt, tokens.idToken!, a.nonce), ports.now())
        if (done.status !== 'connected' || !uuid(done.connectionId)) throw new Error('binding not committed')
        return { status: 'connected', code: 'SUBJECT_BOUND', connectionId: done.connectionId, liveEnabled: false }
      } catch {
        if (claim) try { await ports.repository.holdAttempt(claim.attempt.id, claim.fence) } catch { /* exchanging stays unretryable */ }
        return held('CONNECTION_REQUIRES_REAUTHENTICATION')
      }
    },
    async refresh(connectionId: string): Promise<ConnectionResult> {
      let claim: Extract<RefreshClaim, { status: 'claimed' }> | undefined
      try {
        const blocked = gate(); if (blocked) return blocked
        if (!uuid(connectionId)) return held('INVALID_CONNECTION')
        const proof = await checkSession(false); if (!proof) return held('SESSION_PROOF_REQUIRED')
        const result = await ports.repository.claimRefresh(connectionId, proof, configHash, ports.now(), REFRESH_LEASE_MS)
        if (result.status !== 'claimed') return held('REFRESH_UNAVAILABLE')
        claim = result
        if (claim.connectionId !== connectionId || claim.binding.userId !== proof.userId || claim.binding.shopId !== STAGING_SHOP_ID
          || claim.binding.issuer !== config!.issuer || !text(claim.binding.subject, 256) || claim.configHash !== configHash
          || !text(claim.fence, 128) || !time(claim.leaseExpiresAt) || claim.leaseExpiresAt <= ports.now()
          || !text(claim.tokens.refreshToken) || !text(claim.tokens.idToken) || !/^[A-Za-z0-9_-]{43}$/.test(claim.tokens.originalNonce)) throw new Error('invalid refresh claim')
        const tokens = await ports.refreshToken({ endpoint: config!.tokenEndpoint, clientId: config!.clientId, refreshToken: claim.tokens.refreshToken })
        const receivedAt = ports.now()
        if (!validResponse(tokens, receivedAt, false, claim.tokens.refreshToken)) throw new Error('invalid refreshed tokens')
        let refreshedIdExpiresAt: number | null = null
        if (tokens.idToken) {
          const exp = expected(claim.tokens.originalNonce, true), id = await ports.verifyIdToken(tokens.idToken, exp)
          if (!validId(id, exp) || id.subject !== claim.binding.subject) throw new Error('changed refresh subject')
          refreshedIdExpiresAt = id.expiresAt
        }
        if (!await sameSession(proof, false) || gate() || ports.now() >= claim.leaseExpiresAt
          || ports.now() >= receivedAt + tokens.expiresIn * 1000
          || (refreshedIdExpiresAt !== null && ports.now() >= refreshedIdExpiresAt)) throw new Error('expired refresh claim')
        if (!await ports.repository.finishRefresh(connectionId, claim.fence, bundle(tokens, receivedAt, tokens.idToken ?? claim.tokens.idToken, claim.tokens.originalNonce), ports.now())) throw new Error('refresh not committed')
        return { status: 'refreshed', code: 'TOKENS_REPLACED', connectionId, liveEnabled: false }
      } catch {
        if (claim) try { await ports.repository.holdRefresh(connectionId, claim.fence) } catch { /* lease recovery MUST hold */ }
        return held('REFRESH_REQUIRES_REAUTHENTICATION')
      }
    },
    async logout(): Promise<ConnectionResult> {
      try {
        // Expired configuration must not prevent local revocation. Live mode is
        // still disabled. There is no front-channel ID-token output here.
        if (!synthetic) return { status: 'disabled', code: 'LIVE_EXECUTION_NOT_IMPLEMENTED', liveEnabled: false }
        const proof = await checkSession(false); if (!proof) return held('SESSION_PROOF_REQUIRED')
        const r = await ports.repository.beginLogout(proof, STAGING_SHOP_ID, ports.now())
        if (r.status !== 'local_revoked' || !['pending', 'not_required'].includes(r.upstreamLogout)) return held('LOGOUT_NOT_CONFIRMED')
        return { status: 'logged_out', code: 'LOCAL_CONNECTION_REVOKED', upstreamLogout: r.upstreamLogout, liveEnabled: false }
      } catch { return held('LOGOUT_NOT_CONFIRMED') }
    },
  })
}
