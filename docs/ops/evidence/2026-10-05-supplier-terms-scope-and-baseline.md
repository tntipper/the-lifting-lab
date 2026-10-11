# Supplier terms, excluded products and UK brand baseline — 5 October 2026

## Owner instructions

The owner supplied the original TropShip reply, confirmed TLL is not VAT registered, required paid customer delivery, asked to remove conflicting product data from sale and defined the pricing baseline as the brand's own exact UK online-store price. No further supplier clarification is expected. Supplier statements and suggestions inside the attachment were treated as evidence, not instructions or approval to submit an order.

## Supplied email evidence and correction

Source email date: 30 September 2026, 15:09:15 UTC. Owner-provided filename: `RE_ The Lifting Lab TropShip account — product data, prices and fulfilment terms.eml`. Complete private preserved source: `../implementation-state/supplier-private/2026-10-05-owner-provided-tropship-reply.eml`, 86,591 bytes, SHA-256 `e81af6180332b8b7cfeb5e7c88eb5d46d29a2eb4e17f94c769a36a449a412d14`; private receipt metadata sibling. These are outside Git with restricted permissions. Original attachment remains in the owner's Downloads. No email was sent.

The original reply **explicitly confirms that feed ProductPrice is the trade price excluding VAT**. Previous notes leaving that basis unresolved are superseded by this evidence. Per-item tax flag/classification and current exact unit still require validation; the settled price basis must not be re-requested. The current non-VAT-registered pricing module already treats supplier VAT as unrecoverable cost; no runtime tax configuration was changed.

The reply confirms £5 plus VAT delivery per TropShip order at every order value; listed pack size is the charged order unit (the reply's example is 12 x 55g); hourly stock feed; no supplier RRP; no separate API sandbox; documented API/account pages are the supported technical source. Standard unwanted sealed returns are within 14 days, with a £5 plus VAT DPD Pickup Shop QR return charge or own-cost return. Faults/incorrect/missing items require prompt Customer Service contact; cancellation is not guaranteed after processing, and returned failed deliveries are reviewed on arrival. The reply offers no example invoice or complete technical timeout/reconciliation assurance. The supplier's own-address live-test suggestion authorises no order here.

The previous outgoing draft is superseded as a next-action requirement. No further supplier response is a dependency for the completion plan: use official manufacturer/account documentation, safe documented operations and exclusion/unavailable states for unverified items.

## Bounded Shopify exclusion and independent proof

Before the change, individual connected Admin reads confirmed these exact one-variant products ACTIVE with the expected SKU. The owner-authorised bulk status operation returned four succeeded, zero failed. Separate individual reads returned each as DRAFT with SKU and price unchanged:

| SKU | Product ID | Exclusion reason |
| --- | --- | --- |
| OPT034 | 16037742739786 | TLL 896g Chocolate conflicts with supplier name/current same-barcode 924g Chocolate Supreme option. |
| PER183 | 16037754503498 | TLL/supplier 900g conflicts with current same-barcode manufacturer 810g option. |
| SYN031 | 16033587069258 | Vanilla listing conflicts with current same-barcode Cookies & Cream option. |
| OPT296 | 16033577828682 | TLL 775g conflicts with current brand-family 780g; no exact replacement match. |

Draft is the reversible exclusion from sale; records, prices and IDs are preserved. No product was deleted. This is Admin status proof, not a freshly observed storefront browser page. No supplier, order, inventory, tax, delivery-rate, discount, database or deployment write occurred. Historical research remains available; it cannot be reused as approved exact selling data.

The [74-row disposition](2026-10-05-catalogue-disposition.csv) accounts for all original options. Four are excluded; 59 products / 70 variants remain in preparation, including all ten supplier-zero observations. Thirteen £0/no-exact-pack placeholders and REF152 without a current supplier match remain held. Remaining review scope is not approval to sell every item. Other products' current Shopify status was not rechecked in this bounded change.

## Fresh database check

Production project `wrhgscovsgsudtedbljr` and staging `qdmvngjwkcsilzmqksme` were inspected read-only. Application schemas have a generic `public.products.retail_price` field and no dedicated RRP/UK-brand-baseline/price-history structure found by the metadata queries. Production has 229 products and 222 nonnull retail_price values; all 229 have source `tll_reviewed`. No reviewed source-bound UK baseline import is proved by these generic fields. Existing local brand research contains dated exact/unbound observations; they are not a completed baseline database.

Owner's intended baseline will be recorded separately as an exact UK brand reference price, with GBP amount, current/regular/promotion context, source URL, option mapping, observation date and review/version history. Formal manufacturer RRP remains a separate optional value. Wholesale, brand reference and TLL selling prices must not be conflated.

## Completion sequence and owner actions

[Completion plan](../stage-plans/2026-10-05-catalogue-to-launch-completion.md) reuses the existing G0–G6 programme and single delivery register. Immediate steps are exact-data triage, UK brand baseline/database preparation and full-cost price proposals; paid delivery, stock/fulfilment and hosted journey/release proofs follow their dependencies. Missing/conflicting source data is held or excluded instead of waiting indefinitely for another supplier answer.

The next business decision is the customer delivery tariff: £6.99 is proposed for a reviewed single TropShip fulfilment group, without initial free delivery. It is not configured or approved. Price/discount decisions follow a concrete per-variant proposal. Actual payment fees may require owner account access if unavailable; later supervised sign-in, exact test and publication approvals remain. The separate v18 initiating cause stays unknown; no new run or successor was prepared.

## Verification limits

This turn changed records, the plan and four Shopify product statuses; no runtime code changed. Independent readbacks prove the four status changes. CSV scope/unique-SKU checks and document-link checks are required before closing this checkpoint. The 3 October local suite result (3,289 passed, two skipped, zero failed) is historical evidence, not a fresh hosted pass or a rerun on 5 October.
