// Node/server-only adapter for atomic local account revocation. It returns at
// most the ID-token hint needed by a later reviewed front-channel logout route.
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { VaultTokens } from './customer-connection'
import type { EnvelopeVault } from './customer-token-vault'

const SHOP = '107532616020', ISSUER = `https://shopify.com/authentication/${SHOP}`, PROJECT = 'qdmvngjwkcsilzmqksme'
const unavailable = () => new Error('Customer account logout repository unavailable')
const ensure: (value: unknown) => asserts value = value => { if (!value) throw unavailable() }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value, 'base64url').toString('base64url') === value
const integer = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
  && BigInt(value) <= BigInt('9223372036854775807')
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
  && (value as number) <= 253402300799999
const text = (value: unknown, max = 32_768): value is string => typeof value === 'string' && value.length > 0
  && value.length <= max && value.trim() === value && !/[\x00-\x20\x7f]/.test(value)

export type AccountLogoutInput = Readonly<{ operationId: string; userId: string; sessionId: string }>
export type AccountLogoutResult = Readonly<{ status: 'local_revoked'; operationId: string
  owner: Readonly<{ userId: string; sessionId: string }>; generation: string
  upstreamLogout: Readonly<{ status: 'pending'; idToken: string }> | Readonly<{ status: 'not_required' }> }>
  | Readonly<{ status: 'rejected' }>
export interface CustomerAccountLogoutRepository { beginLogout(input: AccountLogoutInput): Promise<AccountLogoutResult> }

function validateTokens(value: unknown): asserts value is VaultTokens {
  ensure(object(value) && text(value.accessToken) && text(value.refreshToken) && text(value.idToken)
    && ms(value.accessExpiresAt) && opaque(value.originalNonce) && Array.isArray(value.scopes)
    && [...value.scopes].sort().join(' ') === 'customer-account-api:full email openid')
  const scope = value.scopeProvenance, refresh = value.refreshTokenProvenance
  ensure(scope === null || (object(scope) && ['token_response', 'unchanged_request'].includes(scope.source as string)
    && scope.requestedScope === 'openid email customer-account-api:full' && scope.grantType === 'authorization_code'))
  ensure(refresh === null || (object(refresh) && refresh.source === 'token_response' && refresh.grantType === 'authorization_code'))
}

export function createCustomerAccountLogoutRepository(input: {
  pool: CustomerRepositoryPool; vault: EnvelopeVault; syntheticExecution?: boolean; liveEnabled?: boolean
}): CustomerAccountLogoutRepository & { liveEnabled: false } {
  const active = () => input.syntheticExecution === true && input.liveEnabled !== true && typeof window === 'undefined'
  async function call(payload: AccountLogoutInput): Promise<Record<string, unknown>> {
    ensure(active()); const wire = JSON.stringify(payload); ensure(Buffer.byteLength(wire) <= 65_536)
    let client: Awaited<ReturnType<CustomerRepositoryPool['connect']>> | undefined
    let result: Record<string, unknown> | undefined, failed = false
    try {
      client = await input.pool.connect(); await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'"); await client.query("SET LOCAL statement_timeout = '10s'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'")
      const response = await client.query('SELECT tll_bridge_private.account_logout_repository($1::text,$2::jsonb) AS result', ['logout', wire])
      ensure(response.rows.length === 1 && object(response.rows[0].result)); result = response.rows[0].result
      await client.query('COMMIT')
    } catch { failed = true; try { await client?.query('ROLLBACK') } catch { /* uncertain connection is discarded */ } }
    finally { try { client?.release(failed) } catch { failed = true } }
    if (failed || !result) throw unavailable(); return result
  }
  return Object.freeze({ liveEnabled: false as const,
    async beginLogout(value: AccountLogoutInput): Promise<AccountLogoutResult> {
      if (!active()) return { status: 'rejected' }
      ensure(value && uuid(value.operationId) && uuid(value.userId) && uuid(value.sessionId))
      const result = await call(value)
      if (result.status === 'rejected') return { status: 'rejected' }
      ensure(result.status === 'local_revoked' && result.operationId === value.operationId && result.userId === value.userId
        && result.sessionId === value.sessionId && integer(result.generation)
        && (result.upstreamLogout === 'pending' || result.upstreamLogout === 'not_required'))
      if (result.upstreamLogout === 'not_required') return Object.freeze({ status: 'local_revoked', operationId: value.operationId,
        owner: Object.freeze({ userId: value.userId, sessionId: value.sessionId }), generation: result.generation,
        upstreamLogout: Object.freeze({ status: 'not_required' }) })
      ensure(object(result.tokenSource)); const source = result.tokenSource
      ensure(uuid(source.transactionId) && uuid(source.receiptId) && source.shopId === SHOP && source.issuer === ISSUER
        && text(source.subject, 256) && opaque(source.innerPkceChallenge) && ms(source.verifiedAt) && ms(source.proofExpiresAt)
        && source.proofExpiresAt > source.verifiedAt && integer(source.proofFence) && ms(source.accessExpiresAt) && object(source.tokens))
      const aad = ['tll-shopify-proof/v1', PROJECT, 'tokens', source.transactionId, source.receiptId, SHOP, ISSUER,
        source.subject, source.innerPkceChallenge, String(source.verifiedAt), String(source.proofExpiresAt), source.proofFence] as string[]
      const tokens = input.vault.open<unknown>(source.tokens, aad); validateTokens(tokens)
      ensure(tokens.accessExpiresAt === source.accessExpiresAt)
      return Object.freeze({ status: 'local_revoked', operationId: value.operationId,
        owner: Object.freeze({ userId: value.userId, sessionId: value.sessionId }), generation: result.generation,
        upstreamLogout: Object.freeze({ status: 'pending', idToken: tokens.idToken }) })
    },
  })
}
