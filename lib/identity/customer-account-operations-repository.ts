// Node/server-only adapter for the default-disabled account operation store.
// Provider tokens remain encrypted until an acknowledged exact database claim.
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { VaultTokens } from './customer-connection'
import type { EnvelopeVault } from './customer-token-vault'
import type { CustomerAccountOperationsRepository, OrdersClaim } from './customer-account-operations'

const SHOP = '107532616020'
const ISSUER = `https://shopify.com/authentication/${SHOP}`
const PROJECT = 'qdmvngjwkcsilzmqksme'
const unavailable = () => new Error('Customer account operations repository unavailable')
const ensure: (value: unknown) => asserts value = value => { if (!value) throw unavailable() }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value, 'base64url').toString('base64url') === value
const integer = (value: unknown, zero = false): value is string => typeof value === 'string'
  && (zero ? /^(0|[1-9][0-9]{0,18})$/.test(value) : /^[1-9][0-9]{0,18}$/.test(value))
  && BigInt(value) <= BigInt('9223372036854775807')
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
  && (value as number) <= 253402300799999
const text = (value: unknown, max = 32_768): value is string => typeof value === 'string' && value.length > 0
  && value.length <= max && value.trim() === value && !/[\x00-\x20\x7f]/.test(value)

function validateTokens(value: unknown): asserts value is VaultTokens {
  ensure(object(value) && text(value.accessToken) && text(value.refreshToken) && text(value.idToken)
    && ms(value.accessExpiresAt) && opaque(value.originalNonce) && Array.isArray(value.scopes)
    && [...value.scopes].sort().join(' ') === 'customer-account-api:full email openid')
  const scope = value.scopeProvenance, refresh = value.refreshTokenProvenance
  ensure(scope === null || (object(scope) && ['token_response', 'unchanged_request'].includes(scope.source as string)
    && scope.requestedScope === 'openid email customer-account-api:full' && scope.grantType === 'authorization_code'))
  ensure(refresh === null || (object(refresh) && refresh.source === 'token_response' && refresh.grantType === 'authorization_code'))
}

type OwnerOperation = { operationId: string; userId: string; sessionId: string }
type ClaimInput = Parameters<CustomerAccountOperationsRepository['claimOrders']>[0]
type FinishInput = Parameters<CustomerAccountOperationsRepository['finishOrders']>[0]
type HoldInput = Parameters<CustomerAccountOperationsRepository['holdOrders']>[0]

export function createCustomerAccountOperationsRepository(input: {
  pool: CustomerRepositoryPool
  vault: EnvelopeVault
  now?: () => number
  syntheticExecution?: boolean
  liveEnabled?: boolean
}): CustomerAccountOperationsRepository & { liveEnabled: false } {
  const active = () => input.syntheticExecution === true && input.liveEnabled !== true && typeof window === 'undefined'
  const now = input.now ?? Date.now
  const validateOwner = (value: OwnerOperation) => ensure(value && uuid(value.operationId) && uuid(value.userId) && uuid(value.sessionId))

  async function call(op: string, payload: object): Promise<Record<string, unknown>> {
    ensure(active())
    const wire = JSON.stringify(payload); ensure(Buffer.byteLength(wire) <= 65_536)
    let client: Awaited<ReturnType<CustomerRepositoryPool['connect']>> | undefined
    let result: Record<string, unknown> | undefined, failed = false
    try {
      client = await input.pool.connect()
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '10s'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'")
      const response = await client.query('SELECT tll_bridge_private.account_repository($1::text,$2::jsonb) AS result', [op, wire])
      ensure(response.rows.length === 1 && object(response.rows[0].result))
      result = response.rows[0].result
      await client.query('COMMIT')
    } catch {
      failed = true
      try { await client?.query('ROLLBACK') } catch { /* uncertain connection is discarded */ }
    } finally {
      try { client?.release(failed) } catch { failed = true }
    }
    if (failed || !result) throw unavailable()
    return result
  }

  async function quarantine(value: OwnerOperation, expectedFence?: string): Promise<void> {
    try { await call('hold_orders', { ...value, ...(expectedFence === undefined ? {} : { fence: expectedFence }) }) } catch { /* never retry uncertain custody */ }
  }

  return Object.freeze({
    liveEnabled: false as const,
    async claimOrders(value: ClaimInput) {
      if (!active()) return { status: 'rejected' as const }
      validateOwner(value)
      let expectedFence: string | undefined
      try {
        const result = await call('claim_orders', value)
        if (result.status === 'rejected') return { status: 'rejected' as const }
        ensure(result.status === 'claimed' && result.operationId === value.operationId && result.userId === value.userId
          && result.sessionId === value.sessionId && uuid(result.transactionId) && uuid(result.receiptId)
          && integer(result.generation, true) && integer(result.fence) && ms(result.leaseExpiresAt)
          && result.leaseExpiresAt > now() && result.leaseExpiresAt <= now() + 35_000 && object(result.tokenSource))
        expectedFence = result.fence
        const source = result.tokenSource
        ensure(source.transactionId === result.transactionId && source.receiptId === result.receiptId
          && source.shopId === SHOP && source.issuer === ISSUER && text(source.subject, 256)
          && opaque(source.innerPkceChallenge) && ms(source.verifiedAt) && ms(source.proofExpiresAt)
          && source.proofExpiresAt > source.verifiedAt && integer(source.proofFence)
          && ms(source.accessExpiresAt) && source.accessExpiresAt > now() && object(source.tokens))
        const aad = ['tll-shopify-proof/v1', PROJECT, 'tokens', source.transactionId as string,
          source.receiptId as string, SHOP, ISSUER, source.subject as string, source.innerPkceChallenge as string,
          String(source.verifiedAt), String(source.proofExpiresAt), source.proofFence as string]
        const tokens = input.vault.open<unknown>(source.tokens, aad)
        validateTokens(tokens); ensure(tokens.accessExpiresAt === source.accessExpiresAt)
        return Object.freeze({ status: 'claimed', operationId: value.operationId, fence: result.fence,
          owner: Object.freeze({ userId: value.userId, sessionId: value.sessionId }), receiptId: result.receiptId,
          accessToken: tokens.accessToken, accessExpiresAt: tokens.accessExpiresAt } as OrdersClaim)
      } catch {
        await quarantine(value, expectedFence)
        throw unavailable()
      }
    },
    async finishOrders(value: FinishInput) {
      validateOwner(value); ensure(integer(value.fence))
      const result = await call('finish_orders', value)
      return result.status === 'completed'
    },
    async holdOrders(value: HoldInput) {
      validateOwner(value); ensure(value.fence === undefined || integer(value.fence))
      const result = await call('hold_orders', value)
      ensure(result.status === 'held')
    },
  })
}
