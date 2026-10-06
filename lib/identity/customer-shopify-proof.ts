// Unmounted server orchestration for the inner Shopify Customer Account proof.
// No route, credential lookup, provider activation or browser storage is included.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { CUSTOMER_SCOPES, STAGING_CUSTOMER_CLIENT_ID, STAGING_ISSUER,
  type IdVerification, type TokenResponse, type VerifiedId, type VaultTokens } from './customer-connection'
import type { CustomerShopifyProofRepository, ShopifyProofClaim, VerifiedShopifyReceipt } from './customer-shopify-proof-repository'

const SHOP = '107532616020'
const AUTHORIZE = `${STAGING_ISSUER}/oauth/authorize`
const TOKEN = `${STAGING_ISSUER}/oauth/token`
const JWKS = `${STAGING_ISSUER}/.well-known/jwks.json`
const CALLBACK_PATH = '/auth/customer/shopify/callback'
const SCOPE = CUSTOMER_SCOPES.join(' ')
const TTL = 300_000
const originPattern = /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const text = (value: unknown, max = 32_768): value is string => typeof value === 'string' && value.length > 0
  && value.length <= max && value.trim() === value && !/[\x00-\x20\x7f]/.test(value)
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
  && (value as number) <= 253402300799999
const held = () => Object.freeze({ status: 'held' as const, liveEnabled: false as const })

export type ShopifyProofConfig = Readonly<{
  applicationOrigin: string
  verification: Readonly<{ evidenceId: string; configHash: string; verifiedAt: number; expiresAt: number }> | null
}>
export type ShopifyProofPorts = Readonly<{
  repository: CustomerShopifyProofRepository
  exchangeCode(input: { endpoint: string; clientId: string; code: string; verifier: string; redirectUri: string }): Promise<TokenResponse>
  verifyIdToken(token: string, expected: IdVerification): Promise<VerifiedId | null>
  now(): number
}>
export type ShopifyProofResult = Readonly<{ status: 'held'; liveEnabled: false }>
  | Readonly<{ status: 'authorization_ready'; authorizationUrl: string; expiresAt: number; liveEnabled: false }>
  | Readonly<{ status: 'verified'; liveEnabled: false }>

export function shopifyProofConfigHash(config: Pick<ShopifyProofConfig, 'applicationOrigin'>): string {
  return hash(JSON.stringify(['tll-shopify-proof/v1', SHOP, STAGING_ISSUER, STAGING_CUSTOMER_CLIENT_ID,
    AUTHORIZE, TOKEN, JWKS, config.applicationOrigin + CALLBACK_PATH, SCOPE]))
}
function validConfig(config: ShopifyProofConfig | null, now: number): config is ShopifyProofConfig {
  try {
    if (!config || !ms(now) || !originPattern.test(config.applicationOrigin)
      || new URL(config.applicationOrigin).origin !== config.applicationOrigin || config.applicationOrigin.length > 253) return false
    const v = config.verification
    return !!v && text(v.evidenceId, 128) && v.configHash === shopifyProofConfigHash(config)
      && ms(v.verifiedAt) && v.verifiedAt <= now && ms(v.expiresAt) && v.expiresAt > now
      && v.expiresAt > v.verifiedAt && v.expiresAt - v.verifiedAt <= 86_400_000
  } catch { return false }
}
function validResponse(value: TokenResponse, now: number): value is TokenResponse & { idToken: string } {
  if (!value || !text(value.accessToken) || !text(value.refreshToken) || !text(value.idToken)
    || value.tokenType !== 'Bearer' || !Number.isSafeInteger(value.expiresIn) || value.expiresIn <= 0 || value.expiresIn > 86_400
    || !ms(now + value.expiresIn * 1000) || value.scope !== SCOPE) return false
  const split = value.scope.split(' ')
  if (split.length !== CUSTOMER_SCOPES.length || !CUSTOMER_SCOPES.every(scope => split.includes(scope))) return false
  const scope = value.scopeProvenance, refresh = value.refreshTokenProvenance
  return (scope === undefined || (!!scope && ['token_response', 'unchanged_request'].includes(scope.source)
      && scope.requestedScope === SCOPE && scope.grantType === 'authorization_code'))
    && (refresh === undefined || (!!refresh && refresh.source === 'token_response' && refresh.grantType === 'authorization_code'))
}
function validId(value: VerifiedId | null, expected: IdVerification): value is VerifiedId {
  return !!value && value.issuer === expected.issuer && value.audience === expected.audience && value.nonce === expected.nonce
    && text(value.subject, 256) && ms(value.issuedAt) && value.issuedAt <= expected.now
    && ms(value.expiresAt) && value.expiresAt > expected.now && value.expiresAt > value.issuedAt
}
function callback(value: string, expected: string) {
  if (typeof value !== 'string' || value.length > 16_384) throw new Error('held')
  const actual = new URL(value), target = new URL(expected), params = actual.searchParams
  if (actual.origin !== target.origin || actual.pathname !== target.pathname || actual.username || actual.password || actual.port
    || actual.hash || [...params.keys()].some(key => !['state', 'code', 'error', 'error_description'].includes(key))
    || params.getAll('state').length !== 1 || params.getAll('code').length > 1 || params.getAll('error').length > 1
    || params.getAll('error_description').length > 1 || (params.has('error_description') && !params.has('error'))
    || (!!params.get('code') === !!params.get('error')) || !opaque(params.get('state'))) throw new Error('held')
  return params
}

/** Synthetic execution is an offline/staging source gate, not production activation.
 * Trusted ports are server code and must use the confidential adapter and pinned
 * JWKS loader; a browser cannot inject them. */
export function createCustomerShopifyProofFlow(input: {
  config?: ShopifyProofConfig
  ports: ShopifyProofPorts
  syntheticExecution?: boolean
  liveEnabled?: boolean
}) {
  const ports = input.ports
  let config: ShopifyProofConfig | null = null
  try { config = input.config ? structuredClone(input.config) : null } catch { /* held below */ }
  const synthetic = input.syntheticExecution === true && input.liveEnabled !== true
  const gate = () => synthetic && validConfig(config, ports.now())
  const configHash = config ? shopifyProofConfigHash(config) : ''
  const callbackUrl = config ? config.applicationOrigin + CALLBACK_PATH : ''
  const quarantine = async (claim: Extract<ShopifyProofClaim, { status: 'claimed' }> | undefined) => {
    if (!claim) return
    try { await ports.repository.holdAttempt({ transactionId: claim.attempt.transactionId,
      stateHash: claim.attempt.stateHash, fence: claim.fence }) } catch { /* exchanging remains unretryable */ }
  }
  return Object.freeze({
    liveEnabled: false as const,
    async start(value: { transactionId: string; transactionExpiresAt: number }): Promise<ShopifyProofResult> {
      try {
        if (!gate() || !value || !uuid(value.transactionId) || !ms(value.transactionExpiresAt)) return held()
        const now = ports.now(), expiresAt = Math.min(now + TTL, value.transactionExpiresAt, config!.verification!.expiresAt)
        if (expiresAt <= now) return held()
        const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url')
        const attempt = { transactionId: value.transactionId, stateHash: hash(state), configHash, callbackUrl,
          innerPkceChallenge: createHash('sha256').update(verifier).digest('base64url'), verifier,
          nonce: randomBytes(32).toString('base64url'), createdAt: now, expiresAt }
        if (!await ports.repository.createAttempt(attempt) || !gate() || ports.now() >= expiresAt) return held()
        const url = new URL(AUTHORIZE)
        url.search = new URLSearchParams({ client_id: STAGING_CUSTOMER_CLIENT_ID, response_type: 'code', scope: SCOPE,
          redirect_uri: callbackUrl, state, nonce: attempt.nonce, code_challenge: attempt.innerPkceChallenge,
          code_challenge_method: 'S256' }).toString()
        return Object.freeze({ status: 'authorization_ready' as const, authorizationUrl: url.href, expiresAt, liveEnabled: false as const })
      } catch { return held() }
    },
    async complete(value: { transactionId: string; callbackUrl: string }): Promise<ShopifyProofResult> {
      let claim: Extract<ShopifyProofClaim, { status: 'claimed' }> | undefined
      try {
        if (!gate() || !value || !uuid(value.transactionId)) return held()
        const params = callback(value.callbackUrl, callbackUrl)
        const result = await ports.repository.claimAttempt({ operationId: randomUUID(), transactionId: value.transactionId,
          stateHash: hash(params.get('state')!), configHash })
        if (result.status !== 'claimed') return held()
        claim = result; const attempt = claim.attempt
        if (attempt.transactionId !== value.transactionId || attempt.configHash !== configHash || attempt.callbackUrl !== callbackUrl
          || attempt.stateHash !== hash(params.get('state')!) || !opaque(attempt.verifier) || !opaque(attempt.nonce)
          || !opaque(attempt.innerPkceChallenge)
          || attempt.innerPkceChallenge !== createHash('sha256').update(attempt.verifier).digest('base64url')
          || !ms(attempt.createdAt) || attempt.createdAt > ports.now() || !ms(attempt.expiresAt)
          || attempt.expiresAt <= ports.now() || attempt.expiresAt - attempt.createdAt > TTL
          || params.has('error') || !text(params.get('code'), 4096)) throw new Error('held')
        const tokens = await ports.exchangeCode({ endpoint: TOKEN, clientId: STAGING_CUSTOMER_CLIENT_ID,
          code: params.get('code')!, verifier: attempt.verifier, redirectUri: callbackUrl })
        const receivedAt = ports.now()
        if (!validResponse(tokens, receivedAt)) throw new Error('held')
        const expected: IdVerification = { issuer: STAGING_ISSUER, audience: STAGING_CUSTOMER_CLIENT_ID,
          jwksUri: JWKS, nonce: attempt.nonce, now: receivedAt }
        const identity = await ports.verifyIdToken(tokens.idToken, expected), verifiedAt = ports.now()
        if (!validId(identity, expected) || !gate() || verifiedAt < receivedAt || verifiedAt >= attempt.expiresAt
          || verifiedAt >= identity.expiresAt || verifiedAt >= receivedAt + tokens.expiresIn * 1000) throw new Error('held')
        const proofExpiresAt = Math.min(attempt.expiresAt, identity.expiresAt, receivedAt + tokens.expiresIn * 1000)
        if (proofExpiresAt <= verifiedAt) throw new Error('held')
        const privateTokens: VaultTokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
          idToken: tokens.idToken, accessExpiresAt: receivedAt + tokens.expiresIn * 1000,
          scopes: [...CUSTOMER_SCOPES], originalNonce: attempt.nonce,
          scopeProvenance: tokens.scopeProvenance ? structuredClone(tokens.scopeProvenance) : null,
          refreshTokenProvenance: tokens.refreshTokenProvenance ? structuredClone(tokens.refreshTokenProvenance) : null }
        const receipt: VerifiedShopifyReceipt = { transactionId: attempt.transactionId, receiptId: randomUUID(),
          shopId: SHOP, issuer: identity.issuer, subject: identity.subject,
          innerPkceChallenge: attempt.innerPkceChallenge, verifiedAt, expiresAt: proofExpiresAt, tokens: privateTokens }
        if (!await ports.repository.finishAttempt({ transactionId: attempt.transactionId, stateHash: attempt.stateHash,
          fence: claim.fence, receipt })) throw new Error('held')
        return Object.freeze({ status: 'verified' as const, liveEnabled: false as const })
      } catch { await quarantine(claim); return held() }
    },
  })
}
