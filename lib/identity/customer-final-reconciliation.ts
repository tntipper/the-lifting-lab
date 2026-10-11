// Node/server-only final reconciliation coordinator. No routes, cookies, SDK
// storage, database implementation or provider work occurs at import.
import { createHash, randomUUID } from 'node:crypto'
import type { FinalExchangeBinding, ProvisionalSupabaseSession } from './supabase-final-exchange'

const unavailable = () => new Error('Customer final reconciliation unavailable')
const ensure: (value: unknown) => asserts value = value => { if (!value) throw unavailable() }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const sha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value, 'base64url').toString('base64url') === value
const integer = (value: unknown, zero = false): value is string => typeof value === 'string'
  && (zero ? /^(0|[1-9][0-9]{0,18})$/.test(value) : /^[1-9][0-9]{0,18}$/.test(value))
  && BigInt(value) <= BigInt('9223372036854775807')
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
  && (value as number) <= 253402300799999
const subject = (value: unknown): value is string => typeof value === 'string' && value.startsWith('tllb_')
  && opaque(value.slice(5))
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export type CustomerFinalCallback = Readonly<{
  transactionId: string
  browserHash: string
  callbackUrl: string
}>

export type CustomerFinalClaim = Readonly<{
  status: 'claimed'
  transactionId: string
  browserHash: string
  callbackHash: string
  mode: 'sign_in' | 'migration'
  exchange: FinalExchangeBinding
  originalUserId: string | null
  shopifyProofReceiptId: string
  fence: string
  generation: string
  expiresAt: number
}>

export type CustomerFinalRelease = Readonly<{
  status: 'reconciled'
  transactionId: string
  callbackHash: string
  userId: string
  identityId: string
  reservedSubject: string
  session: ProvisionalSupabaseSession['session']
}>

export interface CustomerFinalReconciliationRepository {
  claim(input: CustomerFinalCallback & { operationId: string }): Promise<CustomerFinalClaim | { status: 'rejected' }>
  finish(input: {
    transactionId: string
    operationId: string
    fence: string
    generation: string
    callbackHash: string
    shopifyProofReceiptId: string
    result: ProvisionalSupabaseSession
  }): Promise<boolean>
  release(input: CustomerFinalCallback): Promise<CustomerFinalRelease | { status: 'rejected' }>
  hold(input: CustomerFinalCallback & { operationId: string; fence?: string; generation?: string }): Promise<void>
}

export interface CustomerFinalExchangePort {
  exchangeSignIn(input: FinalExchangeBinding): Promise<ProvisionalSupabaseSession>
  exchangeMigration(input: FinalExchangeBinding & { originalUserId: string }): Promise<ProvisionalSupabaseSession>
}

function callback(input: CustomerFinalCallback): CustomerFinalCallback {
  ensure(object(input) && Object.keys(input).sort().join(',') === 'browserHash,callbackUrl,transactionId'
    && uuid(input.transactionId) && sha(input.browserHash)
    && typeof input.callbackUrl === 'string' && input.callbackUrl.length <= 2048)
  const url = new URL(input.callbackUrl)
  ensure(url.origin === 'https://the-lifting-staging-my-lifting-lab-s-projects.vercel.app'
    || /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(url.origin))
  ensure(url.pathname === '/auth/customer/callback' && !url.hash && !url.username && !url.password
    && url.searchParams.getAll('code').length === 1 && [...url.searchParams.keys()].join(',') === 'code')
  ensure(uuid(url.searchParams.get('code')))
  return Object.freeze({ transactionId: input.transactionId, browserHash: input.browserHash, callbackUrl: url.href })
}

function claim(value: unknown, expected: CustomerFinalCallback, now: number): CustomerFinalClaim {
  ensure(object(value) && value.status === 'claimed'
    && Object.keys(value).sort().join(',') === 'browserHash,callbackHash,exchange,expiresAt,fence,generation,mode,originalUserId,shopifyProofReceiptId,status,transactionId'
    && value.transactionId === expected.transactionId && value.browserHash === expected.browserHash
    && value.callbackHash === hash(expected.callbackUrl) && (value.mode === 'sign_in' || value.mode === 'migration')
    && ((value.mode === 'sign_in' && value.originalUserId === null) || (value.mode === 'migration' && uuid(value.originalUserId)))
    && uuid(value.shopifyProofReceiptId) && integer(value.fence) && integer(value.generation, true)
    && ms(value.expiresAt) && value.expiresAt > now && value.expiresAt - now <= 300_000
    && object(value.exchange)
    && Object.keys(value.exchange).sort().join(',') === 'applicationPkceChallenge,applicationVerifier,authCode,reservedSubject'
    && uuid(value.exchange.authCode) && opaque(value.exchange.applicationVerifier)
    && opaque(value.exchange.applicationPkceChallenge) && subject(value.exchange.reservedSubject)
    && createHash('sha256').update(value.exchange.applicationVerifier).digest('base64url') === value.exchange.applicationPkceChallenge)
  const exchange = value.exchange as Record<string, unknown>
  return Object.freeze({ status: 'claimed' as const, transactionId: value.transactionId as string, browserHash: value.browserHash as string,
    callbackHash: value.callbackHash as string, mode: value.mode as 'sign_in' | 'migration',
    exchange: Object.freeze({ authCode: exchange.authCode as string, applicationVerifier: exchange.applicationVerifier as string,
      applicationPkceChallenge: exchange.applicationPkceChallenge as string, reservedSubject: exchange.reservedSubject as string }),
    originalUserId: value.originalUserId as string | null, shopifyProofReceiptId: value.shopifyProofReceiptId as string,
    fence: value.fence as string, generation: value.generation as string, expiresAt: value.expiresAt as number })
}

function release(value: unknown, expected: CustomerFinalClaim, result: ProvisionalSupabaseSession): CustomerFinalRelease {
  ensure(object(value) && value.status === 'reconciled'
    && Object.keys(value).sort().join(',') === 'callbackHash,identityId,reservedSubject,session,status,transactionId,userId'
    && value.transactionId === expected.transactionId && value.callbackHash === expected.callbackHash
    && value.userId === result.proof.userId && value.identityId === result.identity.identityId
    && value.reservedSubject === expected.exchange.reservedSubject && object(value.session)
    && Object.keys(value.session).sort().join(',') === 'accessToken,expiresAt,refreshToken,tokenType'
    && value.session.accessToken === result.session.accessToken && value.session.refreshToken === result.session.refreshToken
    && value.session.tokenType === 'Bearer' && value.session.expiresAt === result.session.expiresAt)
  const session = value.session as Record<string, unknown>
  return Object.freeze({ status: 'reconciled' as const, transactionId: value.transactionId as string,
    callbackHash: value.callbackHash as string, userId: value.userId as string, identityId: value.identityId as string,
    reservedSubject: value.reservedSubject as string, session: Object.freeze({ accessToken: session.accessToken as string,
      refreshToken: session.refreshToken as string, tokenType: 'Bearer' as const, expiresAt: session.expiresAt as number }) })
}

/**
 * Coordinates the one-use final callback around durable repository authority.
 * The repository owns callback staging, encrypted PKCE/session custody and the
 * atomic cross-store reconciliation. A session is returned only after finish is
 * acknowledged and an independent exact release read confirms the commit.
 */
export function createCustomerFinalReconciliation(input: {
  repository: CustomerFinalReconciliationRepository
  exchange: CustomerFinalExchangePort
  now?: () => number
  syntheticExecution?: boolean
  liveEnabled?: boolean
}) {
  const { repository, exchange } = input, now = input.now ?? Date.now
  const active = () => input.syntheticExecution === true && input.liveEnabled !== true
    && typeof window === 'undefined' && repository && exchange
    && typeof repository.claim === 'function' && typeof repository.finish === 'function'
    && typeof repository.release === 'function' && typeof repository.hold === 'function'
    && typeof exchange.exchangeSignIn === 'function' && typeof exchange.exchangeMigration === 'function'

  return Object.freeze({
    liveEnabled: false as const,
    async complete(value: CustomerFinalCallback): Promise<CustomerFinalRelease> {
      let bound: CustomerFinalCallback | undefined, authority: CustomerFinalClaim | undefined
      try {
        ensure(active())
        bound = callback(value)
        const at = now(); ensure(ms(at))
        const operationId = randomUUID()
        const claimed = await repository.claim({ ...bound, operationId })
        authority = claim(claimed, bound, at)
        const exchanged = authority.mode === 'migration'
          ? await exchange.exchangeMigration({ ...authority.exchange, originalUserId: authority.originalUserId! })
          : await exchange.exchangeSignIn(authority.exchange)
        ensure(exchanged?.kind === 'private_provisional' && object(exchanged.session) && object(exchanged.proof) && object(exchanged.identity)
          && typeof exchanged.session.accessToken === 'string' && exchanged.session.accessToken.length <= 16_384
          && typeof exchanged.session.refreshToken === 'string' && exchanged.session.refreshToken.length <= 16_384
          && exchanged.session.tokenType === 'Bearer' && ms(exchanged.session.expiresAt) && exchanged.session.expiresAt > now()
          && uuid(exchanged.proof.userId) && uuid(exchanged.identity.identityId)
          && exchanged.identity.subject === authority.exchange.reservedSubject && exchanged.identity.userId === exchanged.proof.userId
          && (authority.mode !== 'migration' || exchanged.proof.userId === authority.originalUserId))
        const result: ProvisionalSupabaseSession = Object.freeze({ kind: 'private_provisional',
          session: Object.freeze({ accessToken: exchanged.session.accessToken, refreshToken: exchanged.session.refreshToken,
            tokenType: 'Bearer', expiresAt: exchanged.session.expiresAt }),
          proof: Object.freeze({ ...exchanged.proof }), identity: Object.freeze({ ...exchanged.identity }) })
        const finishOperationId = randomUUID()
        ensure(await repository.finish({ transactionId: authority.transactionId, operationId: finishOperationId,
          fence: authority.fence, generation: authority.generation, callbackHash: authority.callbackHash,
          shopifyProofReceiptId: authority.shopifyProofReceiptId, result }))
        const committed = await repository.release(bound)
        return Object.freeze(release(committed, authority, result))
      } catch {
        if (bound) {
          try { await repository.hold({ ...bound, operationId: randomUUID(),
            ...(authority ? { fence: authority.fence, generation: authority.generation } : {}) }) } catch { /* no release on failed quarantine */ }
        }
        throw unavailable()
      }
    },
    /** Terminally revoke release authority when browser persistence fails after
     * reconciliation. This operation is intentionally idempotence-free. */
    async hold(value: CustomerFinalCallback): Promise<void> {
      try {
        ensure(active())
        const bound = callback(value)
        await repository.hold({ ...bound, operationId: randomUUID() })
      } catch { throw unavailable() }
    },
  })
}
