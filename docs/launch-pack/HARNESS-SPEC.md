# Supplier Harness Spec (v2): TypeScript in lib/commerce

## 0. Reuse first
| Need | Existing code to extend | Port from Python connector (reference) |
|---|---|---|
| Feed parsing | `lib/commerce/supplier-feed.ts` (strict) | `connector/feed.py` column/row checks |
| Mapping | `catalogue-eligibility.ts` `ExactMapping` | none |
| Shopify stock writes | `shopify-admin.ts` (identity checks, uncertain-result reconciliation) | none |
| Variant reads | `shopify-variant-snapshot.ts` | none |
| Inventory operations (no reservations yet) | `inventory-ledger.ts` + migrations 0004/0009 record Shopify inventory changes and reconciliation | `connector/core.py` reservations, recovery |
| Supplier payload | new `harness/adapters/tropship.ts` | `connector/adapters.py` payload and acknowledgement parsing |
| Webhook ingress | new route | `connector/webhooks.py` raw-body HMAC, save before acknowledging |

## 1. Data model (extend; one migration per ticket)
- **Mapping:** saved `ExactMapping` rows: comparison product, Shopify variant, supplier, supplier SKU, EAN, pack, flavour, `cost_ex_vat`, `price_auto` (bool), `active`, approval reference.
- **supplier_snapshots:** supplier, file hash, fetched_at, observed_at, row counts, rejected rows, status.
- **sync_diffs:** run, mapping, field, old, new, applied, reason.
- **reservations (new table):** the existing inventory ledger has no reservation feature, so add one by porting the connector's reservation logic. A paid line reserves stock before submission, and the reservation is released on cancel or reject.
- **supplier_orders:** Shopify order and line, supplier, quantity, local key (unique), status (`pending → submitted → accepted → shipped`, or `rejected`, `uncertain`, `cancelled`), supplier_ref, tracking, attempts, last_error.
- **customer_delivery_payloads:** private schema, encrypted address, minimal role access, deleted N days after shipment (Toby sets N).
- **manual_queue** and **harness_runs**, as in v1.

## 2. Sync jobs (Vercel Cron)
| Job | Schedule | Rules |
|---|---|---|
| stock-price | hourly | The strict parser rejects malformed rows and files (row errors are reported). A file whose row count drops more than 30%, or that is stale, is skipped and raises an alert. Stock writes use absolute values. Price writes happen only where `price_auto` is set and are logged as diffs otherwise. |
| stale-stock expiry | every 15 minutes | If the last good observation is older than 6 hours, the variant is set to unavailable (inventory 0, continue selling denied). |
| catalogue | daily | Image and description diffs for opted-in rows. New or missing SKUs go to the manual queue. |
| tracking | every 30 minutes | Fulfil with explicit line items. Partial shipments fulfil only the lines that shipped. |
| digest | 08:00 daily | Open queue items, absorbed-shipping total, and progress on the evidence window. |

Shopify rate limits: use the GraphQL cost from `extensions.cost` and throttle on available points. Back off when throttled, and keep bulk writes within the documented limits.

## 3. Order routing
1. `orders/paid` webhook → verify the HMAC on the raw body → save to the inbox → return 200.
2. The worker does a **fresh Shopify order read** to confirm it is paid, not cancelled or refunded, and to get the current lines. Then it reserves stock and groups lines by supplier.
3. **Multi-supplier basket:** one supplier order per supplier. The customer has paid £4.99 once, and each supplier order records an absorbed dispatch-cost line.
4. Submission is behind `ORDER_FORWARDING_ENABLED` plus approval. The result is recorded as *submitted* (request sent), *accepted* (supplier acknowledged with an ID), *rejected* or *uncertain* (timeout or unclear response). Uncertain goes to the manual queue and must be reconciled in the supplier portal. It is **never resubmitted automatically**.
5. Email or portal suppliers: "email sent" counts as *submitted*. *Accepted* needs a supplier reply or an operator confirmation.
6. Cancellations or refunds after submission raise an alert and create a queue item.

## 4. Idempotency and recovery
- A local unique key per (order, line, supplier) means webhook replays do nothing.
- Duplicate submissions to the supplier are prevented by recording the submission in the database **before** sending it (the spent marker), and only a human can release it after an uncertain result.
- Crash recovery: a lease or timeout on in-progress rows; recovery only reads and reconciles. Ported from the connector's recovery logic.

## 5. Errors, observability and privacy
- Read calls retry up to 2 times with backoff. Order submissions are never retried automatically.
- `/admin/harness` is admin only. Alerts go to email or Slack. Logs contain no addresses or secrets.
- The 3-day evidence window is tracked in `harness_runs`. Unattended dispatch can only be switched on after 3 clean consecutive days.

## 6. Adapter template
```ts
// lib/commerce/harness/adapters/_template.ts
export const supplierX: SupplierAdapter = {
  id: 'supplier3',
  async fetchCatalogue() { throw new Error('TBC'); },
  async fetchStockPrice() { throw new Error('TBC'); },   // must include observedAt
  async placeOrder(req) { return { status: 'submitted', channel: 'email' }; }, // never 'accepted' without evidence
  async fetchTracking() { return []; },
};
```
- **TropShip:** SFTP CSV feed (the strict parser). Order submission by API once the contract (field casing, auth, acknowledgement) is confirmed, otherwise by email or portal through the queue.
- **Bodypower / PowerBody:** discovery first (ticket T11): confirm the identity, access, terms, feed and catalogue coverage.
- **Supplier 3 (TBC, likely Bodyshocker):** use the template.
