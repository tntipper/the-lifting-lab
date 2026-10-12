import { createHash } from 'node:crypto'
import type { SupplierId } from './types'
import type { PrivateOrderSql } from './order-store'

export type HarnessFailure = { job: 'stock-price' | 'orders' | 'tracking'; code: string; reference: string; orderId?: string; supplier?: SupplierId }
export type ManualItem = { id: string; failureKey: string; job: HarnessFailure['job']; code: string;
  status: 'open' | 'done'; createdAt: string; doneAt: string | null; doneBy: string | null; orderId?: string | null; supplier?: SupplierId | null }
export interface ManualQueueStore {
  enqueue(failure: HarnessFailure): Promise<{ item: ManualItem; inserted: boolean }>
  listOpen(): Promise<ManualItem[]>
  markDone(id: string, actor: string): Promise<boolean>
}
export type AlertMessage = { subject: string; text: string }
/** Sender owns transport/recipients. No SDK, credentials, network or automatic retries here. */
export type AlertSender = (message: AlertMessage) => Promise<void>
export type FailureReporter = (failure: HarnessFailure) => Promise<'disabled' | 'queued' | 'duplicate' | 'queue_failed' | 'alert_failed'>
export function failureKey(failure: HarnessFailure) {
  if (!['stock-price', 'orders', 'tracking'].includes(failure.job) || !/^[A-Z][A-Z0-9_]{0,79}$/.test(failure.code) ||
      !failure.reference || failure.reference.length > 512) throw new Error('FAILURE_INVALID')
  if (failure.orderId !== undefined && !/^gid:\/\/shopify\/Order\/[1-9][0-9]*$/.test(failure.orderId) ||
      failure.supplier !== undefined && !['tropship', 'bodypower', 'supplier3'].includes(failure.supplier)) throw new Error('FAILURE_CONTEXT_INVALID')
  // References are correlation identifiers, never addresses/raw adapter errors. Store only the hash.
  return createHash('sha256').update(JSON.stringify([failure.job, failure.code, failure.reference])).digest('hex')
}
export function createFailureReporter(options: { enabled?: string; alertsEnabled?: string; store: ManualQueueStore; sender?: AlertSender; timeoutMs?: number }): FailureReporter {
  return async failure => {
    if (options.enabled !== 'true') return 'disabled'
    let saved: Awaited<ReturnType<ManualQueueStore['enqueue']>>
    try { failureKey(failure); saved = await options.store.enqueue(failure) } catch { return 'queue_failed' }
    if (!saved.inserted) return 'duplicate'
    if (options.alertsEnabled !== 'true') return 'queued'
    const timeout = options.timeoutMs ?? 10_000
    if (!options.sender || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) return 'alert_failed'
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([options.sender({ subject: 'TLL harness: operator review required',
      text: `Queue item: ${saved.item.id}\nJob: ${failure.job}\nCode: ${failure.code}\nReview /admin/harness. Reconcile uncertain operations before any manual action.` }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('ALERT_TIMEOUT')), timeout) }),
    ]) }
    catch { return 'alert_failed' }
    finally { if (timer) clearTimeout(timer) }
    return 'queued'
  }
}
const columns = `id, failure_key as "failureKey", job, code, status, created_at::text as "createdAt", done_at::text as "doneAt", done_by as "doneBy", order_id as "orderId", supplier`
type Row = ManualItem & Record<string, unknown>
/** Bind a restricted private SQL client only after approved migration application. */
export function createManualQueueStore(db: PrivateOrderSql): ManualQueueStore {
  return {
    async enqueue(failure) {
      const key = failureKey(failure)
      const inserted = await db.query<Row>(`insert into tll_harness_private.manual_queue (failure_key,job,code,order_id,supplier)
        values ($1,$2,$3,$4,$5) on conflict (failure_key) do nothing returning ${columns}`, [key, failure.job, failure.code, failure.orderId ?? null, failure.supplier ?? null])
      if (inserted.rows.length) return { item: inserted.rows[0], inserted: true }
      const existing = await db.query<Row>(`select ${columns} from tll_harness_private.manual_queue where failure_key=$1`, [key])
      if (!existing.rows.length) throw new Error('QUEUE_CONFLICT_NOT_FOUND')
      return { item: existing.rows[0], inserted: false }
    },
    async listOpen() {
      return (await db.query<Row>(`select ${columns} from tll_harness_private.manual_queue where status='open' order by created_at,id`, [])).rows
    },
    async markDone(id, actor) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !actor || actor.length > 128) throw new Error('QUEUE_DONE_INVALID')
      return (await db.query<Row>(`update tll_harness_private.manual_queue set status='done',done_at=now(),done_by=$2
        where id=$1 and status='open' returning ${columns}`, [id, actor])).rows.length === 1
    },
  }
}
/** Pure builder: caller supplies approved private commercial/evidence totals. No reads or sends. */
export function buildDailyDigest(input: { items: readonly ManualItem[]; absorbedShippingPence: number; evidenceDays: number; targetDays: number }): AlertMessage {
  if (![input.absorbedShippingPence, input.evidenceDays, input.targetDays].every(n => Number.isSafeInteger(n) && n >= 0) || input.targetDays < 1 || input.evidenceDays > input.targetDays) throw new Error('DIGEST_TOTALS_INVALID')
  const open = input.items.filter(item => item.status === 'open')
  const counts = new Map<string, number>()
  for (const item of open) {
    if (!['stock-price', 'orders', 'tracking'].includes(item.job) || !/^[A-Z][A-Z0-9_]{0,79}$/.test(item.code)) throw new Error('DIGEST_ITEM_INVALID')
    const key = `${item.job}: ${item.code}`; counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return { subject: 'TLL harness daily digest', text: [
    `Open queue items: ${open.length}`, ...[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `${key}: ${count}`),
    `Absorbed supplier shipping: £${(input.absorbedShippingPence / 100).toFixed(2)}`,
    `Order dispatch evidence window: ${input.evidenceDays}/${input.targetDays} days`, 'Review /admin/harness.',
  ].join('\n') }
}
