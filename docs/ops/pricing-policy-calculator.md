# Pricing policy calculator

`lib/commerce/pricing-policy.ts` is a pure, deterministic planning module. It has no service connections, records, price writes or checkout enforcement. Every assessment has `liveEnabled: false` and `checkoutVerified: false`. Mathematical eligibility describes the supplied reviewed inputs; it is not publication or checkout authority. A trusted integration must authenticate and preserve approvals rather than trust arbitrary caller-provided `approved: true` values.

## Current account-specific policy — 24 September 2026

The existing 35% target contribution margin, 25% minimum and £3 minimum contribution for a single-item sale remain unchanged. Tropicana's 14 September 2026 welcome email for this TropShip account says **£5 plus VAT for each TropShip order**. It assigns free delivery above £100 to a separate wholesale account. Version `tll-tropship-standard-uk-order-2026-09-24-v3` therefore budgets £6 unrecoverable cost once per supplier order at every wholesale total. TLL is not VAT registered; input VAT is unrecoverable and no output VAT is charged.

| One TropShip supplier order | Supplier quoted delivery, ex VAT | Gross cash/economic planning cost | Decision |
| --- | ---: | ---: | --- |
| Any supported wholesale total | £5 | £6 | Charged once per supplier order |

The public [Tropicana delivery terms](https://www.tropicanawholesale.com/help/delivery/) describe a general £100 free-delivery threshold without separating the account type. The account-specific email contradicts applying that rule to TLL's TropShip orders and takes precedence for conservative planning. Confirm the account tariff with Tropicana before price publication; a different written answer requires another version and review. The public terms describe next **working** day delivery and possible delays; this calculator makes no delivery-time guarantee. [TropShip's service page](https://www.tropicanawholesale.com/TROPSHIP/) separately describes a 4pm cut-off and DPD tracking.

The old per-item rule and VAT-registered examples are [superseded historical evidence](history/pricing-policy-v1-superseded.md). The later v2 free-above-£100 rule is also superseded for this TropShip account. The supplier email does **not** confirm any product's wholesale amount, VAT basis/rate, pack or sellable-unit definition. Those inputs remain HOLD until independently approved.

## Input contract and version lineage

`PricingContext.supplierDeliveryTariff` is mandatory and includes a fresh approval with the exact current version and fixed `SUPPLIER_DELIVERY_TARIFF_VALUES`. Old versions, a free-delivery threshold, changed charges, missing approval or expired terms fail closed. The record explicitly names `tropship_standard_uk`; Saturday, export or other services require a separately reviewed tariff. A future VAT-registration change needs a versioned replacement business-tax policy.

`CostRecord` now contains wholesale, distinct additional unit costs, an explicit returns reserve, approved unit definition and approved output-tax treatment. It no longer accepts `supplierDelivery`: that field belongs to the superseded per-item model and returns HOLD rather than being ignored or double-counted. Each product/additional cost still declares its approved inclusive, exclusive or not-subject VAT basis and rate. Recoverable input tax or non-zero output tax is incompatible with the current business policy. Unapproved/missing/unknown wholesale tax is held; `VAT`, `Zero`, geography or Shopify flags do not establish the basis.

Approved VAT-exclusive wholesale uses the declared amount; approved VAT-inclusive wholesale is divided exactly by `1 + VAT rate`. A positive approved not-subject amount has zero VAT. Unrecoverable VAT remains in economic cost. The exact ex-VAT wholesale value is still reported for audit, but it no longer reduces this TropShip delivery charge. Customer retail totals and any proposed customer free-shipping rule are separate from supplier cost.

All values use GBP integer input pence and integer basis-point rates. Money calculations use reduced BigInt rational fractions; outputs serialize as numerator/denominator strings. Amounts are bounded to `MAX_PENCE` (1,000,000,000 pence), with at most 100 lines and 10,000 billable units. Approvals carry version/expected-version, start and exclusive expiry. At `nowMs == expiresAtMs`, an input is held. Every floor/basket records all approval versions and an intersected `dependencyValidity`; later review cannot renew old evidence.

## Conservative standalone product floor

`calculatePriceFloor` always models **one sellable item in its own supplier order** with £6 delivery cost. No future basket volume, other product margin, customer shipping or shared payment fee can reduce a published product's standalone floor.

For attributable economic unit cost plus standalone delivery plus one fixed payment fee `C`, discount cap `d`, variable payment rate `f`, margin `m` and minimum cash contribution `K`, the current non-registered operating policy gives:

```text
required gross after discount >= max(C / (1 - m - f), (C + K) / (1 - f))
```

The implementation uses the general tax-factor form, but the approved current output factor must be exactly one. It finds the lowest whole-penny list price that still passes after the actual percentage discount rounds half-up. It returns minimum and separate target floors, the limiting rule, exact contribution/margin and clearly separated supplier quoted ex-VAT, gross cash and economic delivery amounts. The current tariff always reports `supplierDeliveryBasis: one_item_supplier_order` and `supplierDeliveryStatus: charged`.

The catalogue cost gate binds the current tariff version, standalone basis/status, £6 gross delivery amount and exact wholesale value. It rejects shared-basket floors, old fee records, missing lineage and any claimed free TropShip delivery, including at or above £100 wholesale.

Synthetic reference only: 1,000p approved not-subject wholesale, 600p gross delivery, 50p reserve, 25p fixed payment fee and 2% variable fee produce **2,295p** minimum / **2,659p** target without a discount, and **2,550p** minimum at a 10% discount cap. These figures do not establish real product tax, supplier cost or payment fees. A 0.03% cap requires 2,296p because the actual penny-rounded discount would make 2,295p fail.

## Actual basket/order assessment

`evaluateBasket` requires an explicit `supplierOrders` array. Every group has a unique supplier-order ID, an opaque `customerDeliveryId`, the supported service and its own fresh approval. Each line supplies the same supplier-order ID and customer-delivery identity. Missing, duplicate, empty, mismatched, stale, unsupported or unapproved groups are held. These identities are references supplied by the trusted order-routing layer, not customer names or addresses; the calculator neither verifies physical destinations nor infers group membership.

Each approved supplier order costs **£6 delivery**, even if several products share that order or its wholesale total exceeds £100. Two separate supplier orders cost £12, even if they go to the same customer. Multi-line wholesale values still aggregate for audit, but cannot reduce the TropShip charge.

Actual quoted ex-VAT delivery, gross cash and economic cost are reported per group and for the basket. The one gross charge is allocated to lines by billable quantity using integer largest remainders, with line ID as the deterministic tie-breaker. It sums exactly to the group charge and is stable under input reordering. Quoted-net allocations are exact proportional rational values and sum exactly to the quoted charge. Because input VAT is unrecoverable, the allocated economic cost equals the allocated gross cash. No part of supplier delivery is netted against customer shipping.

The basket subtracts actual group delivery charges and the actual fixed payment fee once. Product and customer-shipping receipts both incur variable payment fees. Fixed-payment reporting is allocated proportionally over those gross receipts; line and shipping contributions sum exactly to the basket contribution. Customer shipping amounts remain explicit, independently approved inputs: this change does not set a customer free-shipping threshold or alter checkout shipping charges.

Each line must also pass its conservative standalone list floor and actual quantity-discounted margin/cash tests. Those **separate publication safeguards** use standalone delivery and one fixed payment fee per item; `conservativeLineContributionPence` reports that conservative scenario, not another basket charge. A profitable neighbour cannot conceal an underpriced product. The default basket cash safeguard remains £3 times quantity.

Percentage discount is applied to gross line total and rounded half-up before the explicit fixed/code/reward allocation. Discounts must not exhaust revenue or exceed the approved cap. Sparse/malformed inputs are rejected before aggregation. Margin/cash and excess-discount holds retain the calculation when it can be computed honestly; missing approvals, unknown taxes or invalid records do not invent a zero-valued calculation.

## Validation and release gates

This revision's focused pricing/catalogue tests and TypeScript checks pass; see its dated evidence record for exact checks. The tests cover price-floor arithmetic, discounts, approved tax bases, below/at/above-£100 wholesale totals that all retain £6 delivery, repeated quantities, separate supplier orders, allocation, stale tariff rejection, catalogue lineage and disabled writes.

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
