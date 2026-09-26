import { CartUnavailable, type CartRecord, type CartRepository } from './staging-cart-service'

const HEX = /^[a-f0-9]{64}$/
export function parseCartRecord(value: unknown, session: string, actor: string): CartRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CartUnavailable()
  const row = value as CartRecord
  if (row.sessionHash !== session || row.actorHash !== actor || !HEX.test(session) || !HEX.test(actor)
    || !Number.isSafeInteger(row.revision) || row.revision < 0 || !['ready', 'working', 'held'].includes(row.phase)
    || !Number.isSafeInteger(row.quantity) || row.quantity < 0 || row.quantity > 5
    || !Number.isSafeInteger(row.subtotalPence) || row.subtotalPence < 0
    || row.quantity > 0 && (!Number.isSafeInteger(row.unitPricePence) || Number(row.unitPricePence) <= 0 || row.subtotalPence !== Number(row.unitPricePence) * row.quantity)
    || row.quantity === 0 && (row.unitPricePence !== null || row.subtotalPence !== 0)
    || !Number.isFinite(Date.parse(row.expiresAt))) throw new CartUnavailable()
  return row
}
export type CartRepositoryConnection = {
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
  release(destroy?: boolean): void
}
export type CartRepositoryPool = { connect(): Promise<CartRepositoryConnection> }
/** Dedicated cart executor only. A record is never released before COMMIT is acknowledged. */
export function createCartRepository(options: { enabled: boolean; pool: CartRepositoryPool }): CartRepository {
  if (options.enabled !== true) throw new CartUnavailable()
  const statements = {
    open: 'SELECT public.tll_cart_open($1::text,$2::text) AS result',
    read: 'SELECT public.tll_cart_read($1::text,$2::text) AS result',
    claim: 'SELECT public.tll_cart_claim($1::text,$2::text,$3::uuid,$4::text,$5::bigint,$6::integer) AS result',
    finish: 'SELECT public.tll_cart_finish($1::text,$2::text,$3::uuid,$4::text,$5::jsonb,$6::integer,$7::integer,$8::integer) AS result',
  } as const
  async function rpc(name: keyof typeof statements, args: unknown[]): Promise<unknown> {
    let connection: CartRepositoryConnection | undefined
    let acknowledged = false
    try {
      connection = await options.pool.connect()
      await connection.query('BEGIN')
      const response = await connection.query(statements[name], args)
      if (response.rows.length !== 1 || !Object.hasOwn(response.rows[0], 'result')) throw new CartUnavailable()
      await connection.query('COMMIT')
      acknowledged = true
      return response.rows[0].result
    } catch {
      // The connection may have committed even when its response was lost. Never
      // retry or expose an unacknowledged reservation; destroy this connection.
      throw new CartUnavailable()
    } finally { connection?.release(!acknowledged) }
  }
  return {
    async open(session, actor) { return parseCartRecord(await rpc('open', [session, actor]), session, actor) },
    async read(session, actor) { const value = await rpc('read', [session, actor]); return value === null ? null : parseCartRecord(value, session, actor) },
    async claim(session, actor, requestId, requestHash, revision, quantity) {
      const value = await rpc('claim', [session, actor, requestId, requestHash, revision, quantity]) as { status?: string; record?: unknown }
      if (!value || !['claimed', 'replay', 'conflict', 'held'].includes(value.status ?? '')) throw new CartUnavailable()
      return { status: value.status as 'claimed' | 'replay' | 'conflict' | 'held', record: parseCartRecord(value.record, session, actor) }
    },
    async finish(session, actor, requestId, state, envelope, observation) {
      return parseCartRecord(await rpc('finish', [session, actor, requestId, state, envelope === null ? null : JSON.stringify(envelope),
        observation?.quantity ?? null, observation?.unitPricePence ?? null, observation?.subtotalPence ?? null]), session, actor)
    },
  }
}
