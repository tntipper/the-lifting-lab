// Server-only coordinator. Durable token custody is supplied by a future
// default-disabled repository; no route or provider configuration is mounted.
import { randomUUID } from 'node:crypto'
import type { SupabaseSessionProof } from './customer-connection'
import type { CustomerOrdersProjection } from './customer-orders'

type Owner = Readonly<{ userId: string; sessionId: string }>
export type OrdersClaim = Readonly<{ status: 'claimed'; operationId: string; fence: string; owner: Owner
  receiptId: string; accessToken: string; accessExpiresAt: number }>
export interface CustomerAccountOperationsRepository {
  claimOrders(input: Owner & { operationId: string }): Promise<OrdersClaim | { status: 'rejected' }>
  finishOrders(input: Owner & { operationId: string; fence: string }): Promise<boolean>
  holdOrders(input: Owner & { operationId: string; fence?: string }): Promise<void>
}
export interface CustomerOrdersPort { read(accessToken: string): Promise<CustomerOrdersProjection> }
const unavailable = () => new Error('Customer account operation unavailable')
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const fence = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
const credential = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 32_768 && !/[\x00-\x20\x7f]/.test(value)
const proof = (value: SupabaseSessionProof | null, now: number): value is SupabaseSessionProof => !!value
  && uuid(value.userId) && uuid(value.sessionId) && value.issuer === 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
  && value.audience === 'authenticated' && value.anonymous === false && ms(value.checkedAt) && value.checkedAt <= now && value.checkedAt > now - 10_000
  && ms(value.expiresAt) && value.expiresAt > now
const same = (left: SupabaseSessionProof, right: SupabaseSessionProof) => left.userId === right.userId && left.sessionId === right.sessionId

export function createCustomerAccountOperations(input: {
  repository: CustomerAccountOperationsRepository; orders: CustomerOrdersPort
  currentSession(): Promise<SupabaseSessionProof | null>; now?: () => number
  syntheticExecution?: boolean; liveEnabled?: boolean
}) {
  const now = input.now ?? Date.now
  const active = () => input.syntheticExecution === true && input.liveEnabled !== true && typeof window === 'undefined'
    && typeof input.currentSession === 'function' && typeof input.repository?.claimOrders === 'function'
    && typeof input.repository?.finishOrders === 'function' && typeof input.repository?.holdOrders === 'function'
    && typeof input.orders?.read === 'function'
  return Object.freeze({
    async readOrders(): Promise<CustomerOrdersProjection> {
      if (!active()) throw unavailable()
      const session = await input.currentSession(), at = now()
      if (!ms(at) || !proof(session, at)) throw unavailable()
      const owner = { userId: session.userId, sessionId: session.sessionId }, operationId = randomUUID()
      let claim: OrdersClaim | null = null
      try {
        const value = await input.repository.claimOrders({ ...owner, operationId })
        if (value.status !== 'claimed' || value.operationId !== operationId || value.owner.userId !== owner.userId
          || value.owner.sessionId !== owner.sessionId || !fence(value.fence) || !uuid(value.receiptId)
          || !credential(value.accessToken) || !ms(value.accessExpiresAt) || value.accessExpiresAt <= now()) throw unavailable()
        claim = value
        const result = await input.orders.read(claim.accessToken)
        const current = await input.currentSession(), checkedAt = now()
        if (!ms(checkedAt) || !proof(current, checkedAt) || !same(session, current) || claim.accessExpiresAt <= checkedAt) throw unavailable()
        if (!await input.repository.finishOrders({ ...owner, operationId, fence: claim.fence })) throw unavailable()
        return result
      } catch {
        if (claim) try { await input.repository.holdOrders({ ...owner, operationId, fence: claim.fence }) } catch { /* claimed operation remains non-releasable */ }
        throw unavailable()
      }
    },
  })
}
