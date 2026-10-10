// Server-only, unmounted Shopify proof custody. Browser code never receives an
// attempt verifier, nonce, provider token, subject or proof receipt.
import type { BrokerShopifyProof } from './customer-subject-broker'
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { EnvelopeVault } from './customer-token-vault'
import type { VaultTokens } from './customer-connection'

const SHOP = '107532616020'
const ISSUER = `https://shopify.com/authentication/${SHOP}`
const PROJECT = 'qdmvngjwkcsilzmqksme'
const unavailable = () => new Error('Shopify proof repository unavailable')
const ensure: (value: unknown) => asserts value = value => { if (!value) throw unavailable() }
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const fence = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
  && BigInt(value) <= BigInt('9223372036854775807')
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
  && (value as number) <= 253402300799999
const text = (value: unknown, max = 32_768): value is string => typeof value === 'string' && value.length > 0
  && value.length <= max && value.trim() === value && !/[\x00-\x20\x7f]/.test(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export type ShopifyProofAttempt = Readonly<{
  transactionId: string
  stateHash: string
  configHash: string
  callbackUrl: string
  innerPkceChallenge: string
  verifier: string
  nonce: string
  createdAt: number
  expiresAt: number
}>

export type ShopifyProofClaim = Readonly<{
  status: 'claimed'
  attempt: ShopifyProofAttempt
  fence: string
}> | Readonly<{ status: 'rejected' }>

export type VerifiedShopifyReceipt = BrokerShopifyProof & Readonly<{ tokens: VaultTokens }>

export interface CustomerShopifyProofRepository {
  createAttempt(attempt: ShopifyProofAttempt): Promise<boolean>
  claimAttempt(input: { operationId: string; transactionId: string; stateHash: string; configHash: string }): Promise<ShopifyProofClaim>
  finishAttempt(input: { transactionId: string; stateHash: string; fence: string; receipt: VerifiedShopifyReceipt }): Promise<boolean>
  verifiedSubject(transactionId: string): Promise<BrokerShopifyProof | null>
  holdAttempt(input: { transactionId: string; stateHash: string; fence?: string }): Promise<void>
}

function attempt(value: ShopifyProofAttempt) {
  ensure(value && uuid(value.transactionId) && sha(value.stateHash) && sha(value.configHash)
    && /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app\/auth\/customer\/shopify\/callback$/.test(value.callbackUrl)
    && opaque(value.innerPkceChallenge) && opaque(value.verifier) && opaque(value.nonce)
    && ms(value.createdAt) && ms(value.expiresAt) && value.expiresAt > value.createdAt
    && value.expiresAt - value.createdAt <= 300_000)
}
function tokens(value: VaultTokens) {
  ensure(value && text(value.accessToken) && text(value.refreshToken) && text(value.idToken)
    && ms(value.accessExpiresAt) && opaque(value.originalNonce) && Array.isArray(value.scopes)
    && [...value.scopes].sort().join(' ') === 'customer-account-api:full email openid')
  const scope = value.scopeProvenance, refresh = value.refreshTokenProvenance
  ensure(scope === null || (record(scope) && ['token_response', 'unchanged_request'].includes(scope.source as string)
    && scope.requestedScope === 'openid email customer-account-api:full' && scope.grantType === 'authorization_code'))
  ensure(refresh === null || (record(refresh) && refresh.source === 'token_response' && refresh.grantType === 'authorization_code'))
}
function proof(value: BrokerShopifyProof) {
  ensure(value && uuid(value.transactionId) && uuid(value.receiptId) && value.shopId === SHOP && value.issuer === ISSUER
    && text(value.subject, 256) && opaque(value.innerPkceChallenge) && ms(value.verifiedAt) && ms(value.expiresAt)
    && value.expiresAt > value.verifiedAt)
}
function attemptAad(value: Omit<ShopifyProofAttempt, 'verifier' | 'nonce'>): string[] {
  return ['tll-shopify-proof/v1', PROJECT, 'attempt', value.transactionId, value.stateHash, value.configHash,
    value.callbackUrl, value.innerPkceChallenge, String(value.createdAt), String(value.expiresAt)]
}
function tokenAad(value: BrokerShopifyProof, expectedFence: string): string[] {
  proof(value); ensure(fence(expectedFence))
  return ['tll-shopify-proof/v1', PROJECT, 'tokens', value.transactionId, value.receiptId, value.shopId,
    value.issuer, value.subject, value.innerPkceChallenge, String(value.verifiedAt), String(value.expiresAt), expectedFence]
}

/** Both the TypeScript and SQL gates default disabled. The customer executor can
 * call only the fixed SECURITY DEFINER operation; it has no table/ciphertext access. */
export function createCustomerShopifyProofRepository(input: {
  pool: CustomerRepositoryPool
  vault: EnvelopeVault
  syntheticExecution?: boolean
  liveEnabled?: boolean
}): CustomerShopifyProofRepository & { liveEnabled: false } {
  const enabled = input.syntheticExecution === true && input.liveEnabled !== true
  async function call(op: string, payload: object): Promise<Record<string, unknown>> {
    ensure(enabled)
    let client: Awaited<ReturnType<CustomerRepositoryPool['connect']>> | undefined
    let result: Record<string, unknown> | undefined, failed = false
    try {
      client = await input.pool.connect()
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '10s'")
      const response = await client.query('SELECT tll_customer_private.shopify_proof_repository($1::text,$2::jsonb) AS result',
        [op, JSON.stringify(payload)])
      ensure(response.rows.length === 1 && record(response.rows[0].result))
      result = response.rows[0].result
      await client.query('COMMIT')
    } catch {
      failed = true
      try { await client?.query('ROLLBACK') } catch { /* discard below */ }
    } finally { client?.release(failed) }
    if (failed || !result) throw unavailable()
    return result
  }
  async function hold(transactionId: string, stateHash: string, expectedFence?: string) {
    if (!enabled) return
    ensure(uuid(transactionId) && sha(stateHash) && (expectedFence === undefined || fence(expectedFence)))
    await call('hold', { transactionId, stateHash, ...(expectedFence ? { fence: expectedFence } : {}) })
  }
  return Object.freeze({
    liveEnabled: false as const,
    async createAttempt(value: ShopifyProofAttempt) {
      if (!enabled) return false
      const captured = structuredClone(value); attempt(captured)
      const metadata = { transactionId: captured.transactionId, stateHash: captured.stateHash, configHash: captured.configHash,
        callbackUrl: captured.callbackUrl, innerPkceChallenge: captured.innerPkceChallenge,
        createdAt: captured.createdAt, expiresAt: captured.expiresAt }
      const material = input.vault.seal({ verifier: captured.verifier, nonce: captured.nonce }, attemptAad(metadata))
      try {
        const result = await call('create', { ...metadata, material })
        return result.status === 'created'
      } catch {
        try { await hold(captured.transactionId, captured.stateHash) } catch { /* unknown create remains quarantined if committed */ }
        throw unavailable()
      }
    },
    async claimAttempt(value: { operationId: string; transactionId: string; stateHash: string; configHash: string }): Promise<ShopifyProofClaim> {
      if (!enabled) return { status: 'rejected' } as const
      ensure(value && uuid(value.operationId) && uuid(value.transactionId) && sha(value.stateHash) && sha(value.configHash))
      let result: Record<string, unknown>
      try {
        result = await call('claim', structuredClone(value))
      } catch {
        try { await hold(value.transactionId, value.stateHash) } catch { /* exchanging state remains unretryable */ }
        throw unavailable()
      }
      if (result.status !== 'claimed') return { status: 'rejected' } as const
      try {
        ensure(result.transactionId === value.transactionId && result.stateHash === value.stateHash
          && result.configHash === value.configHash && fence(result.fence) && typeof result.callbackUrl === 'string'
          && opaque(result.innerPkceChallenge) && ms(result.createdAt) && ms(result.expiresAt))
        const metadata = { transactionId: value.transactionId, stateHash: value.stateHash, configHash: value.configHash,
          callbackUrl: result.callbackUrl, innerPkceChallenge: result.innerPkceChallenge,
          createdAt: result.createdAt, expiresAt: result.expiresAt }
        const privateMaterial = input.vault.open<{ verifier: string; nonce: string }>(result.material, attemptAad(metadata))
        const claimed = { ...metadata, verifier: privateMaterial.verifier, nonce: privateMaterial.nonce }
        attempt(claimed)
        return { status: 'claimed', attempt: Object.freeze(claimed), fence: result.fence } as const
      } catch {
        if (fence(result.fence)) try { await hold(value.transactionId, value.stateHash, result.fence) } catch { /* held recovery remains explicit */ }
        throw unavailable()
      }
    },
    async finishAttempt(value: { transactionId: string; stateHash: string; fence: string; receipt: VerifiedShopifyReceipt }) {
      if (!enabled) return false
      ensure(value && uuid(value.transactionId) && sha(value.stateHash) && fence(value.fence))
      const receipt = structuredClone(value.receipt); proof(receipt); tokens(receipt.tokens)
      ensure(receipt.transactionId === value.transactionId && receipt.tokens.originalNonce.length === 43
        && receipt.tokens.accessExpiresAt >= receipt.expiresAt)
      const { tokens: tokenBundle, ...publicProof } = receipt
      try {
        const result = await call('finish', { transactionId: value.transactionId, stateHash: value.stateHash,
          fence: value.fence, proof: publicProof, accessExpiresAt: tokenBundle.accessExpiresAt,
          tokens: input.vault.seal(tokenBundle, tokenAad(publicProof, value.fence)) })
        if (result.status === 'verified') return true
        try { await hold(value.transactionId, value.stateHash, value.fence) } catch { /* exchanging remains unretryable */ }
      } catch {
        try { await hold(value.transactionId, value.stateHash, value.fence) } catch { /* same fence must remain held on recovery */ }
        throw unavailable()
      }
      return false
    },
    async verifiedSubject(transactionId: string) {
      if (!enabled) return null
      ensure(uuid(transactionId))
      const result = await call('read', { transactionId })
      if (result.status !== 'verified') return null
      const value = result.proof as BrokerShopifyProof; proof(value)
      ensure(value.transactionId === transactionId)
      return Object.freeze(structuredClone(value))
    },
    holdAttempt: (value: { transactionId: string; stateHash: string; fence?: string }) => hold(value.transactionId, value.stateHash, value.fence),
  })
}
