import type { OrderInbox, PaidOrderEvent } from './orders-paid-http'
import type { OrderPlan, OrderRoutingStore, RoutedLine } from './route-orders'

/** Caller supplies a private server client; this module imports no DB SDK and opens no connection. */
export interface PrivateOrderSql {
  query<T extends Record<string, unknown>>(sql: string, values: readonly unknown[]): Promise<{ rows: T[] }>
}
export interface PrivateOrderDatabase extends PrivateOrderSql {
  /** BEGIN/COMMIT; every error rolls back. Callback queries MUST use the same connection. */
  transaction<T>(run: (tx: PrivateOrderSql) => Promise<T>): Promise<T>
}
export function createOrderInbox(db: PrivateOrderSql): OrderInbox {
  return { async save(event) {
    const result = await db.query<{ id: string }>(`insert into tll_harness_private.order_inbox (shop,event_id,order_id)
      values ($1,$2,$3) on conflict (shop,event_id) do nothing returning id`, [event.shop, event.eventId, event.orderId])
    return result.rows.length ? 'saved' : 'duplicate'
  } }
}
/** Bind only after approved migration + trusted stock source. Nothing is connected by the route. */
export function createOrderRoutingStore(options: {
  db: PrivateOrderDatabase;
  /** TODO(T08/Toby): lock trusted stock by supplier/SKU in deterministic order; compare ALL grouped
   * quantities against available stock minus outstanding private reservations. Throw on any shortage
   * or stale/unknown observation. Locks must be held on tx until this plan transaction commits. */
  checkAndLockStock: (tx: PrivateOrderSql, lines: readonly RoutedLine[]) => Promise<void>
}): OrderRoutingStore {
  const { db } = options
  return {
    async planAndReserve(plan: OrderPlan) {
      return db.transaction(async tx => {
        const inserted = await tx.query<{ id: string }>(`insert into tll_harness_private.order_plans (shop,order_id)
          values ($1,$2) on conflict (shop,order_id) do nothing returning id`, [plan.shop, plan.orderId])
        if (!inserted.rows.length) return 'duplicate'
        const planId = inserted.rows[0].id
        await options.checkAndLockStock(tx, plan.groups.flatMap(g => g.lines))
        await tx.query(`insert into tll_harness_private.customer_delivery_payloads (plan_id,encrypted_address) values ($1,$2)`, [planId, plan.encryptedAddress])
        for (const group of plan.groups) {
          const batch = await tx.query<{ id: string }>(`insert into tll_harness_private.supplier_order_batches
            (plan_id,supplier,local_key,absorbed_dispatch_pence) values ($1,$2,$3,$4) returning id`,
          [planId, group.supplier, group.localKey, group.absorbedDispatchPence])
          for (const line of group.lines) {
            const row = await tx.query<{ id: string }>(`insert into tll_harness_private.supplier_orders
              (batch_id,shop,order_id,line_id,variant_id,mapping_id,supplier,supplier_sku,quantity,local_key)
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
            [batch.rows[0].id, plan.shop, plan.orderId, line.lineId, line.variantId, line.mappingId, line.supplier, line.sku, line.quantity, line.localKey])
            await tx.query(`insert into tll_harness_private.order_reservations (supplier_order_id,quantity) values ($1,$2)`, [row.rows[0].id, line.quantity])
          }
        }
        return 'created'
      })
    },
    async claimSubmission(localKey) {
      // Autocommit query must resolve after commit; never call supplier transport inside a DB transaction.
      const result = await db.query<{ claimed: boolean }>(`select tll_harness_private.claim_order_submission($1) as claimed`, [localKey])
      return result.rows[0]?.claimed === true
    },
    async recordResult(localKey, result) {
      await db.transaction(async tx => {
        const batch = await tx.query<{ id: string }>(`update tll_harness_private.supplier_order_batches
          set status=$2,supplier_ref=$3,last_error_code=$4
          where local_key=$1 and attempts=1 and status='manual' and last_error_code='SUBMISSION_IN_PROGRESS' returning id`,
        [localKey, result.status, result.supplierRef ?? null, result.code])
        if (batch.rows.length !== 1) throw new Error('SPENT_BATCH_REQUIRED')
        await tx.query(`update tll_harness_private.supplier_orders set status=$2,supplier_ref=$3,last_error_code=$4 where batch_id=$1`,
          [batch.rows[0].id, result.status, result.supplierRef ?? null, result.code])
        if (result.status === 'rejected') await tx.query(`update tll_harness_private.order_reservations set status='released'
          where supplier_order_id in (select id from tll_harness_private.supplier_orders where batch_id=$1)`, [batch.rows[0].id])
      })
    },
    async complete(event: PaidOrderEvent) {
      // Never turn an unresolved/crashed batch into a successful receipt or automatically reclaim it.
      await db.query(`update tll_harness_private.order_inbox set
        status = case when exists (select 1 from tll_harness_private.supplier_order_batches b
          join tll_harness_private.order_plans p on p.id=b.plan_id
          where p.shop=$1 and p.order_id=$3 and b.status in ('pending','manual')) then 'manual' else 'processed' end,
        last_error_code = case when exists (select 1 from tll_harness_private.supplier_order_batches b
          join tll_harness_private.order_plans p on p.id=b.plan_id
          where p.shop=$1 and p.order_id=$3 and b.status in ('pending','manual')) then 'RECOVERY_REVIEW_REQUIRED' else null end
        where shop=$1 and event_id=$2 and status='pending'`, [event.shop, event.eventId, event.orderId])
    },
    async hold(event: PaidOrderEvent, code: string) {
      await db.query(`insert into tll_harness_private.order_inbox (shop,event_id,order_id,status,last_error_code)
        values ($1,$2,$3,'manual',$4) on conflict (shop,event_id) do update set status='manual',last_error_code=excluded.last_error_code`,
      [event.shop, event.eventId, event.orderId, code])
    },
  }
}
