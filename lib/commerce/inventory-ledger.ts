import { createHash } from 'node:crypto'
import type { createShopifyAdminAdapter, ShopifyInventoryObservation, ShopifyInventoryPlan, ShopifyPreparedManifest } from './shopify-admin'

type SqlResult = { rows: Array<{ result: unknown }> }
/** An exclusively checked-out PostgreSQL connection, initially idle. */
export type InventoryLedgerConnection = {
  query(statement: string, parameters?: readonly unknown[]): Promise<SqlResult>
  /** Discard the connection after any failed transaction/ambiguous response. */
  release(discard?: boolean): void
}
export type InventoryLedgerPool = { connect(): Promise<InventoryLedgerConnection> }
export type LedgerResult = { status: string; [key: string]: unknown }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
const fenceValid = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/** Only fixed parameterised calls; COMMIT acknowledgement precedes every return. */
export function createInventoryLedgerRepository(pool: InventoryLedgerPool) {
  async function committed(statement: string, parameters: readonly unknown[]): Promise<LedgerResult> {
    let connection: InventoryLedgerConnection | undefined, committing = false, discard = false
    try {
      connection = await pool.connect()
      await connection.query('BEGIN')
      await connection.query("SET LOCAL synchronous_commit = 'on'")
      const response = await connection.query(statement, parameters)
      if (response.rows.length !== 1) throw new Error('Invalid ledger result')
      const value = response.rows[0].result
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as LedgerResult).status !== 'string') throw new Error('Invalid ledger result')
      committing = true
      await connection.query('COMMIT')
      return value as LedgerResult
    } catch {
      discard = true
      try { await connection?.query('ROLLBACK') } catch {}
      // A lost commit response may mean the attempt marker was committed.
      // The caller must not proceed to Shopify or retry a possibly sent operation.
      return { status: committing ? 'ledger_uncertain' : 'ledger_unavailable' }
    } finally { try { connection?.release(discard) } catch {} }
  }
  return Object.freeze({
    enqueue: (document: string) => committed('select tll_inventory_private.enqueue($1::text) as result', [document]),
    claim: (id: string, worker: string, leaseSeconds = 120) => committed('select tll_inventory_private.claim($1::uuid,$2::uuid,$3::integer) as result', [id, worker, leaseSeconds]),
    beginAttempt: (id: string, worker: string, fence: string, hash: string) => committed('select tll_inventory_private.begin_attempt($1::uuid,$2::uuid,$3::bigint,$4::text) as result', [id, worker, fence, hash]),
    beginReconciliation: (id: string, worker: string, fence: string, outcome: string, groupId: string | null) => committed('select tll_inventory_private.begin_reconciliation($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text) as result', [id, worker, fence, outcome, groupId]),
    finishReconciliation: (id: string, worker: string, fence: string, token: string, result: 'reconciled' | 'hold', observation: ShopifyInventoryObservation | null) => committed('select tll_inventory_private.finish_reconciliation($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::text,$6::jsonb) as result', [id, worker, fence, token, result, observation === null ? null : JSON.stringify(observation)]),
  })
}
export type InventoryLedgerRepository = ReturnType<typeof createInventoryLedgerRepository>
type Adapter = ReturnType<typeof createShopifyAdminAdapter>

/** Persistence is of the issued manifest, not a caller's re-created request. */
export async function enqueuePreparedInventoryOperation(repository: InventoryLedgerRepository, adapter: Adapter, plan: ShopifyInventoryPlan): Promise<LedgerResult> {
  const described = adapter.describePreparedPlan(plan)
  if (described.status !== 'manifest') return { status: 'hold', code: described.code }
  return repository.enqueue(JSON.stringify(described.manifest))
}

export type InventoryWorkerResult = { status: 'disabled' | 'completed' | 'held' | 'blocked'; code: string; operationId: string; retryAllowed: false }
/** One bounded operation, not a scheduler. Restored manifests never become plans. */
export async function runInventoryOperation(options: {
  repository: InventoryLedgerRepository
  adapter: Adapter
  operationId: string
  workerId: string
  issuedPlan?: ShopifyInventoryPlan
  enabled?: boolean
  leaseSeconds?: number
}): Promise<InventoryWorkerResult> {
  const result = (status: InventoryWorkerResult['status'], code: string): InventoryWorkerResult => ({ status, code, operationId: uuid(options.operationId) ? options.operationId : '', retryAllowed: false })
  if (options.enabled !== true) return result('disabled', 'WORKER_DISABLED')
  if (!uuid(options.operationId) || !uuid(options.workerId)) return result('blocked', 'INVALID_IDENTITY')
  const { repository, adapter, operationId, workerId } = options
  try {
    const claimed = await repository.claim(operationId, workerId, options.leaseSeconds ?? 120)
    if (claimed.status !== 'claimed') return result('blocked', 'CLAIM_UNAVAILABLE')
    if (claimed.operation_id !== operationId || claimed.worker_id !== workerId || !fenceValid(claimed.fence) || !['first_attempt', 'reconcile_only'].includes(String(claimed.mode)) || typeof claimed.manifest_document !== 'string') return result('blocked', 'CLAIM_INVALID')
    const fence = claimed.fence
    let manifest: ShopifyPreparedManifest
    try { manifest = JSON.parse(claimed.manifest_document) } catch { return result('blocked', 'MANIFEST_INVALID') }
    if (manifest?.schemaVersion !== 'tll-inventory-operation/v1' || manifest.plan?.operationId !== operationId || typeof manifest.requestDocument !== 'string' || digest(manifest.requestDocument) !== manifest.plan.requestHash || digest(JSON.stringify(manifest.binding)) !== manifest.plan.bindingHash) return result('blocked', 'MANIFEST_INVALID')
    const described = options.issuedPlan ? adapter.describePreparedPlan(options.issuedPlan) : null
    const owned = claimed.mode === 'first_attempt' && described?.status === 'manifest' && JSON.stringify(described.manifest) === claimed.manifest_document
    let token: unknown = claimed.reconcile_token, acknowledged = false, adapterReconciled = false
    if (owned) {
      const marked = await repository.beginAttempt(operationId, workerId, fence, manifest.plan.requestHash)
      if (marked.status !== 'attempt_committed') return result('blocked', 'ATTEMPT_NOT_CONFIRMED')
      // The repository has acknowledged COMMIT before any outbound mutation.
      // Marked-but-not-sent and sent-with-lost-response both recover conservatively.
      let outcome = 'unknown', groupId: string | null = null
      try {
        const sent = await adapter.executeChange(options.issuedPlan!)
        if (sent.status === 'acknowledged') { outcome = 'acknowledged'; groupId = sent.adjustmentGroupId; acknowledged = true }
        else if (sent.status === 'rejected') outcome = 'rejected'
      } catch { /* preserve the committed attempt marker */ }
      const reconciling = await repository.beginReconciliation(operationId, workerId, fence, outcome, groupId)
      if (reconciling.status !== 'reconciling') return result('blocked', 'RECONCILIATION_NOT_CONFIRMED')
      token = reconciling.reconcile_token
      if (acknowledged) {
        try { adapterReconciled = (await adapter.reconcileChange(options.issuedPlan!)).status === 'reconciled' } catch {}
      }
    } else if (claimed.mode === 'first_attempt') {
      // A queued operation after restart has no executable in-memory plan, even
      // if no attempt happened. Exported JSON is evidence, never restore authority.
      const reconciling = await repository.beginReconciliation(operationId, workerId, fence, 'not_sent', null)
      if (reconciling.status !== 'reconciling') return result('blocked', 'RECONCILIATION_NOT_CONFIRMED')
      token = reconciling.reconcile_token
    }
    if (!uuid(token)) return result('blocked', 'RECONCILIATION_TOKEN_INVALID')
    let observation: ShopifyInventoryObservation | null = null
    try {
      // An additional exact read supplies durable full evidence; the adapter's
      // own reconcile return is deliberately only a compact result, not a snapshot.
      const read = await adapter.readTarget(manifest.binding)
      if (read.status === 'observed') observation = read.observation
    } catch {}
    const desired = observation?.level?.available === manifest.plan.desiredAvailable
    const completion = owned && acknowledged && adapterReconciled && desired
    const finished = await repository.finishReconciliation(operationId, workerId, fence, token, completion ? 'reconciled' : 'hold', observation)
    if (finished.status === 'completed') return result('completed', 'ACKNOWLEDGED_AND_RECONCILED')
    if (finished.status === 'held') return result('held', owned ? 'OUTCOME_REQUIRES_REVIEW' : 'RESTART_REQUIRES_NEW_PLAN')
    return result('blocked', 'FINISH_NOT_CONFIRMED')
  } catch { return result('blocked', 'WORKER_INTERRUPTED') }
}
