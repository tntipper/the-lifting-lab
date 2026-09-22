# Pricing policy calculator

`lib/commerce/pricing-policy.ts` is a pure, deterministic planning module. It has no service connections, records, price writes or checkout enforcement. Every assessment has `liveEnabled: false` and `checkoutVerified: false`. Mathematical eligibility describes the supplied reviewed inputs; it is not publication or checkout authority. A trusted integration must authenticate and preserve approvals rather than trust arbitrary caller-provided `approved: true` values.

## Current owner policy — 15 September 2026

The existing 35% target contribution margin, 25% minimum and £3 minimum contribution for a single-item sale remain unchanged. The owner has confirmed TropShip standard UK delivery **per supplier order/customer-delivery group**, superseding the earlier £5-per-item assumption. Version `tll-tropship-standard-uk-order-2026-09-15-v2` also binds the confirmed operating status: TLL is not VAT registered; input VAT is unrecoverable and no output VAT is charged.

| Approved wholesale value of one supplier order, excluding VAT | Supplier quoted delivery, ex VAT | Gross cash/economic planning cost | Decision |
| --- | ---: | ---: | --- |
| Less than £100 | £5 | £6 | Charged |
| Exactly £100 | £5 conservative estimate | £6 conservative estimate | **HOLD: boundary not specified** |
| Strictly more than £100 | £0 | £0 | Free |

The supplier's published delivery terms distinguish orders above £100 excluding VAT from orders under £100 with a £5-plus-VAT fee. They do not specify equality. This supports the owner-confirmed tariff and the explicit equality hold. The page describes next **working** day delivery, Monday–Friday excluding weekends and national bank holidays, subject to its conditions and delays; this calculator makes no dispatch or delivery-time guarantee. [Tropicana delivery terms](https://www.tropicanawholesale.com/help/delivery/). TropShip separately describes a 4pm order cut-off and a DPD tracked, insured service. [TropShip service description](https://www.tropicanawholesale.com/TROPSHIP/).

The old per-item delivery rule, VAT-registered examples, test totals and earlier supplier-terms uncertainty are retained as [superseded historical evidence](history/pricing-policy-v1-superseded.md). Supplier delivery confirmation is current owner authority; it is **not** confirmation of any actual product's wholesale amount, VAT basis/rate, pack or sellable-unit definition. Those inputs remain HOLD until independently approved. No actual supplier costs or wholesale tax assumptions are created by this change.

## Input contract and version lineage

`PricingContext.supplierDeliveryTariff` is mandatory and includes a fresh approval with the exact current version and the fixed exported `SUPPLIER_DELIVERY_TARIFF_VALUES`. Old versions, changed thresholds/charges, missing approval or expired terms fail closed. The record explicitly names `tropship_standard_uk`; Saturday, export or other services require a separately reviewed tariff and are not inferred from these terms. Its accounting status is restricted to the confirmed non-registered business. A future VAT-registration change needs an explicitly versioned replacement business-tax policy and coordinated calculations, not a per-line toggle.

`CostRecord` now contains wholesale, distinct additional unit costs, an explicit returns reserve, approved unit definition and approved output-tax treatment. It no longer accepts `supplierDelivery`: that field belongs to the superseded per-item model and returns HOLD rather than being ignored or double-counted. Each product/additional cost still declares its approved inclusive, exclusive or not-subject VAT basis and rate. Recoverable input tax or non-zero output tax is incompatible with the current business policy. Unapproved/missing/unknown wholesale tax is held; `VAT`, `Zero`, geography or Shopify flags do not establish the basis.

Wholesale threshold value is calculated separately from economic cost. Approved VAT-exclusive wholesale uses the declared amount; approved VAT-inclusive wholesale is divided exactly by `1 + VAT rate`. A positive approved not-subject amount has zero VAT. Unrecoverable VAT remains in economic cost. Customer retail totals, customer shipping, discounts, rewards, payment fees and extra costs never contribute to the supplier wholesale threshold. Inclusive VAT conversions remain rational fractions until comparison: £120 inclusive at an approved 20% rate equals precisely £100 ex VAT and is held.

All values use GBP integer input pence and integer basis-point rates. Money calculations use reduced BigInt rational fractions; outputs serialize as numerator/denominator strings. Amounts are bounded to `MAX_PENCE` (1,000,000,000 pence), with at most 100 lines and 10,000 billable units. Approvals carry version/expected-version, start and exclusive expiry. At `nowMs == expiresAtMs`, an input is held. Every floor/basket records all approval versions and an intersected `dependencyValidity`; later review cannot renew old evidence.

## Conservative standalone product floor

`calculatePriceFloor` always models **one sellable item in its own supplier order**. The order tariff is evaluated against that item's approved wholesale ex-VAT value. No future basket volume, other product margin, customer shipping or shared payment fee can reduce a published product's standalone floor.

For attributable economic unit cost plus standalone delivery plus one fixed payment fee `C`, discount cap `d`, variable payment rate `f`, margin `m` and minimum cash contribution `K`, the current non-registered operating policy gives:

```text
required gross after discount >= max(C / (1 - m - f), (C + K) / (1 - f))
```

The implementation uses the general tax-factor form, but the approved current output factor must be exactly one. It finds the lowest whole-penny list price that still passes after the actual percentage discount rounds half-up. It returns minimum and separate target floors, the limiting rule, exact contribution/margin and clearly separated supplier quoted ex-VAT, gross cash and economic delivery amounts. `supplierDeliveryBasis` is `one_item_supplier_order`; `supplierDeliveryStatus` is `charged`, `free` or `boundary_hold`.

At an exactly £100 standalone threshold the module still computes a reviewable £6-cost floor, but the assessment is ineligible. A projection must not publish this estimate as approved. The catalogue cost gate binds the current tariff version, standalone basis/status, gross delivery amount and exact wholesale threshold result; it rejects shared-basket floors, old fee records, missing lineage and free-at-equality claims.

Synthetic reference only: 1,000p approved not-subject wholesale, 600p gross delivery, 50p reserve, 25p fixed payment fee and 2% variable fee produce **2,295p** minimum / **2,659p** target without a discount, and **2,550p** minimum at a 10% discount cap. These figures do not establish real product tax, supplier cost or payment fees. A 0.03% cap requires 2,296p because the actual penny-rounded discount would make 2,295p fail.

## Actual basket/order assessment

`evaluateBasket` requires an explicit `supplierOrders` array. Every group has a unique supplier-order ID, an opaque `customerDeliveryId`, the supported service and its own fresh approval. Each line supplies the same supplier-order ID and customer-delivery identity. Missing, duplicate, empty, mismatched, stale, unsupported or unapproved groups are held. These identities are references supplied by the trusted order-routing layer, not customer names or addresses; the calculator neither verifies physical destinations nor infers group membership.

Separate supplier orders do not pool their wholesale thresholds, even if they share a customer delivery. A quantity of five £10 wholesale items in one group costs **£6 total delivery**, a quantity of ten reaches the £100 boundary and is held with a £6 estimate, and eleven qualify for zero delivery. Two separate six-item orders each cost £6. Multi-line wholesale values aggregate only within the approved group.

Actual quoted ex-VAT delivery, gross cash and economic cost are reported per group and for the basket. The one gross charge is allocated to lines by billable quantity using integer largest remainders, with line ID as the deterministic tie-breaker. It sums exactly to the group charge and is stable under input reordering. Quoted-net allocations are exact proportional rational values and sum exactly to the quoted charge. Because input VAT is unrecoverable, the allocated economic cost equals the allocated gross cash. No part of supplier delivery is netted against customer shipping.

The basket subtracts actual group delivery charges and the actual fixed payment fee once. Product and customer-shipping receipts both incur variable payment fees. Fixed-payment reporting is allocated proportionally over those gross receipts; line and shipping contributions sum exactly to the basket contribution. Customer shipping amounts remain explicit, independently approved inputs: this change does not set a customer free-shipping threshold or alter checkout shipping charges.

Each line must also pass its conservative standalone list floor and actual quantity-discounted margin/cash tests. Those **separate publication safeguards** use standalone delivery and one fixed payment fee per item; `conservativeLineContributionPence` reports that conservative scenario, not another basket charge. A free supplier order or profitable neighbour cannot conceal a product whose standalone price/actual rounded line receipts fail. The default basket cash safeguard remains £3 times quantity. A separately approved `orderCashPolicy` can change the order minimum without removing individual-item guards.

Percentage discount is applied to gross line total and rounded half-up before the explicit fixed/code/reward allocation. Discounts must not exhaust revenue or exceed the approved cap. Sparse/malformed inputs are rejected before aggregation. Margin/cash, excess-discount and threshold-boundary holds retain the calculation when it can be computed honestly; missing approvals, unknown taxes or invalid records do not invent a zero-valued calculation.

## Validation and release gates

Validation for this revision: **187 focused pricing/catalogue tests** and **775 total unit tests pass**. TypeScript passes; lint has zero errors and six pre-existing warnings. Tests cover independent lowest-penny floor oracles, minimum/target basket replays, quantity discount regressions, inclusive/exclusive threshold conversions, £99.99/£100/£100.01, repeated quantities, multiple lines, separate supplier orders/deliveries, exact net/gross/economic allocations, customer-receipt independence, unknown taxes, approval version/expiry, catalogue lineage and all default-disabled flags.

```sh
node --experimental-strip-types --test tests/pricing-policy.test.mjs tests/catalogue-eligibility.test.mjs
npm run typecheck
npm run lint
npm test
```

Actual product wholesale VAT bases, pack quantities and costs remain unresolved until evidenced. Invoice/payment-provider rounding, checkout promotion allocation, refunds and non-refundable fees must be reconciled against the chosen environment before any activation. The trusted integration must preserve group identity, cost/policy/payment/tariff versions and their validity at execution. No live price/API write, customer shipping change or hosted acceptance is claimed.

Retail-price scheduling, flash sales, affiliate-specific customer discounts,
affiliate commission and paid campaign spend are separate future inputs. Before
activation, the calculator must be extended and independently verified against
the versioned [retail, promotion and affiliate controls](retail-promotions-affiliate-controls.md).
The combined burden must pass the same standalone line and order safeguards;
an affiliate code or marketing budget can never bypass the approved price
floor. The current module does not create campaigns, attribute orders or
authorize Shopify discount configuration.
