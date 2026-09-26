// Server-only coordinator for local-first unified account logout. It performs no
// cookie work and follows no provider redirect; route composition owns both.
import { randomUUID } from 'node:crypto'
import { STAGING_ISSUER, STAGING_SUPABASE_ISSUER, type SupabaseSessionProof } from './customer-connection'
import type { AccountLogoutResult, CustomerAccountLogoutRepository } from './customer-account-logout-repository'

const END_SESSION_ENDPOINT = `${STAGING_ISSUER}/logout`
const unavailable = () => new Error('Customer account logout unavailable')
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const generation = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
  && BigInt(value) <= BigInt('9223372036854775807')
const credential = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  && value.length <= 32_768 && value.trim() === value && !/[\x00-\x20\x7f]/.test(value)
const proof = (value: SupabaseSessionProof | null, now: number): value is SupabaseSessionProof => !!value
  && uuid(value.userId) && uuid(value.sessionId) && value.issuer === STAGING_SUPABASE_ISSUER
  && value.audience === 'authenticated' && value.anonymous === false && ms(value.authenticatedAt)
  && value.authenticatedAt <= now && ms(value.checkedAt)
  && value.checkedAt <= now && value.checkedAt > now - 10_000 && ms(value.expiresAt) && value.expiresAt > now

export type CustomerAccountLogoutOutcome =
  | Readonly<{ status: 'logged_out'; providerRedirect: string | null }>
  | Readonly<{ status: 'local_revoked'; code: 'SESSION_INVALIDATION_FAILED' }>
  | Readonly<{ status: 'held'; code: 'LOGOUT_UNCERTAIN' }>

function exactResult(value: AccountLogoutResult, owner: SupabaseSessionProof, operationId: string): value is Extract<AccountLogoutResult, { status: 'local_revoked' }> {
  return value.status === 'local_revoked' && value.operationId === operationId
    && value.owner.userId === owner.userId && value.owner.sessionId === owner.sessionId && generation(value.generation)
    && (value.upstreamLogout.status === 'not_required'
      || value.upstreamLogout.status === 'pending' && credential(value.upstreamLogout.idToken))
}

export function createCustomerAccountLogout(input: {
  repository: CustomerAccountLogoutRepository
  currentSession(): Promise<SupabaseSessionProof | null>
  invalidateSupabaseSession(): Promise<boolean>
  applicationOrigin: string
  now?: () => number
  syntheticExecution?: boolean
  liveEnabled?: boolean
}) {
  const now = input.now ?? Date.now
  const active = () => input.syntheticExecution === true && input.liveEnabled !== true && typeof window === 'undefined'
    && typeof input.repository?.beginLogout === 'function' && typeof input.currentSession === 'function'
    && typeof input.invalidateSupabaseSession === 'function'
  let postLogoutRedirect: string | null = null
  try {
    const origin = new URL(input.applicationOrigin)
    if (/^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(origin.origin)
      && origin.href === origin.origin + '/') postLogoutRedirect = new URL('/auth', origin).href
  } catch { /* invalid configuration remains unavailable */ }

  return Object.freeze({
    async logout(): Promise<CustomerAccountLogoutOutcome> {
      if (!active() || !postLogoutRedirect) throw unavailable()
      let result: Extract<AccountLogoutResult, { status: 'local_revoked' }> | null = null
      try {
        const owner = await input.currentSession(), checkedAt = now()
        if (!ms(checkedAt) || !proof(owner, checkedAt)) throw unavailable()
        const operationId = randomUUID()
        const candidate = await input.repository.beginLogout({ operationId, userId: owner.userId, sessionId: owner.sessionId })
        if (!exactResult(candidate, owner, operationId)) throw unavailable()
        result = candidate
      } catch { /* session invalidation is still mandatory below */ }

      let invalidated = false
      try { invalidated = await input.invalidateSupabaseSession() === true } catch { /* route must still clear local cookies */ }
      if (!result) return Object.freeze({ status: 'held' as const, code: 'LOGOUT_UNCERTAIN' as const })
      if (!invalidated) return Object.freeze({ status: 'local_revoked' as const, code: 'SESSION_INVALIDATION_FAILED' as const })
      if (result.upstreamLogout.status === 'not_required') return Object.freeze({ status: 'logged_out' as const, providerRedirect: null })
      const redirect = new URL(END_SESSION_ENDPOINT)
      redirect.search = new URLSearchParams({ id_token_hint: result.upstreamLogout.idToken,
        post_logout_redirect_uri: postLogoutRedirect }).toString()
      return Object.freeze({ status: 'logged_out' as const, providerRedirect: redirect.href })
    },
  })
}
