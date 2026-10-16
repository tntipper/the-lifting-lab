import type { PrivateOrderDatabase } from './order-store'
import type { TrackingClaim, TrackingOrderLine, TrackingStore } from './tracking'

/** Reuses T09's injected private transaction contract. No SDK, credentials or connection. */
export function createTrackingStore(db: PrivateOrderDatabase): TrackingStore {
  return {
    async listCandidates(shop) {
      const result = await db.query<TrackingOrderLine>(`select so.local_key as "localKey", so.shop, so.order_id as "orderId",
        so.line_id as "lineId", so.supplier, so.supplier_ref as "supplierRef", so.supplier_sku as sku,
        so.quantity, so.fulfilled_quantity as "fulfilledQuantity", so.status
        from tll_harness_private.supplier_orders so
        where so.shop=$1 and so.status in ('submitted','accepted') and exists
          (select 1 from tll_harness_private.supplier_orders outstanding where outstanding.batch_id=so.batch_id
            and outstanding.status in ('submitted','accepted') and outstanding.quantity > outstanding.fulfilled_quantity)
        order by so.order_id, so.supplier, so.local_key`, [shop])
      return result.rows
    },
    async lookup(key, fingerprint) {
      const result = await db.query<{ fingerprint: string; status: string }>(`select fingerprint,status from tll_harness_private.tracking_attempts where local_key=$1`, [key])
      const row = result.rows[0]
      if (!row) return 'new'
      if (row.fingerprint !== fingerprint) return 'conflict'
      return ['in_progress', 'uncertain'].includes(row.status) ? 'unresolved' : 'duplicate'
    },
    async claim(plan: TrackingClaim) {
      // Same order serialises competing parcels. Every quantity change rolls back on any failure.
      const blocked = new Error('TRACKING_QUANTITY_BLOCKED')
      try {
        return await db.transaction(async tx => {
          await tx.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [JSON.stringify([plan.shop, plan.orderId])])
          const attempt = await tx.query<{ local_key: string }>(`insert into tll_harness_private.tracking_attempts
            (local_key,fingerprint,shop,order_id,lines,request) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
            on conflict (local_key) do nothing returning local_key`,
          [plan.key, plan.fingerprint, plan.shop, plan.orderId, JSON.stringify(plan.lines), JSON.stringify(plan.request)])
          if (!attempt.rows.length) {
            const existing = await tx.query<{ fingerprint: string }>(`select fingerprint from tll_harness_private.tracking_attempts where local_key=$1`, [plan.key])
            return existing.rows[0]?.fingerprint === plan.fingerprint ? 'duplicate' as const : 'conflict' as const
          }
          for (const line of plan.lines) {
            const locked = await tx.query<{ id: string }>(`update tll_harness_private.supplier_orders
              set tracking_reserved_quantity=tracking_reserved_quantity+$4
              where local_key=$1 and shop=$2 and order_id=$3 and status in ('submitted','accepted')
                and quantity-fulfilled_quantity-tracking_reserved_quantity >= $4 returning id`,
            [line.localKey, plan.shop, plan.orderId, line.quantity])
            if (locked.rows.length !== 1) throw blocked
          }
          return 'claimed' as const
        })
      } catch (error) { if (error === blocked) return 'blocked'; throw error }
    },
    async finish(key, result) {
      await db.transaction(async tx => {
        const attempt = await tx.query<{ lines: TrackingClaim['lines']; shop: string; order_id: string }>(`update tll_harness_private.tracking_attempts
          set status=$2,fulfillment_id=$3,finished_at=now() where local_key=$1 and status='in_progress' returning lines,shop,order_id`,
        [key, result.status, result.fulfillmentId ?? null])
        if (attempt.rows.length !== 1) throw new Error('TRACKING_SPENT_MARKER_REQUIRED')
        // Uncertain quantities remain reserved until an operator reconciles Shopify. Never clear on rerun.
        if (result.status === 'uncertain') return
        const saved = attempt.rows[0]
        for (const line of saved.lines) {
          const updated = await tx.query<{ id: string; quantity: number; fulfilled_quantity: number }>(`update tll_harness_private.supplier_orders
            set tracking_reserved_quantity=tracking_reserved_quantity-$4,fulfilled_quantity=fulfilled_quantity+$5
            where local_key=$1 and shop=$2 and order_id=$3 and tracking_reserved_quantity >= $4
            returning id,quantity,fulfilled_quantity`,
          [line.localKey, saved.shop, saved.order_id, line.quantity, result.status === 'completed' ? line.quantity : 0])
          if (updated.rows.length !== 1) throw new Error('TRACKING_RESERVATION_REQUIRED')
          if (updated.rows[0].fulfilled_quantity === updated.rows[0].quantity) {
            await tx.query(`update tll_harness_private.order_reservations set status='released' where supplier_order_id=$1`, [updated.rows[0].id])
          }
        }
      })
    },
  }
}
