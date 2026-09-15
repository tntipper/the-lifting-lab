# Historical evidence: pricing policy v1 — SUPERSEDED

**Historical snapshot only. Do not use this document to approve a cost, floor, tax treatment, supplier delivery or deployment.** On 15 September 2026 the owner confirmed the replacement TropShip order tariff and TLL's non-VAT-registered status. The £5-per-item rule and registered/recoverable-tax examples below are superseded. Their old test totals/commands describe that earlier revision, not current validation. The source snapshot is commit `2492980ec9f6f70ab0841961a636db92530ccab9`.

Use the [current pricing policy](../pricing-policy-calculator.md). Owner confirmation is the current policy authority; the prior supplier-terms gap is historical and does not create a new confirmation gate. Actual product wholesale VAT bases remain unapproved until separately evidenced.

---

# Pricing policy calculator foundation

`lib/commerce/pricing-policy.ts` is an evaluation-only, deterministic module. It reads no environment variables, connects to no services, writes no records and changes no prices. Every result has `liveEnabled: false` and `checkoutVerified: false`, including a result with `eligible: true`.

`eligible` means the supplied approved inputs passed this mathematical assessment. It is **not** approval to publish a product, write a Shopify price or permit a checkout. Input approval records must be supplied by a trusted later integration; the calculator cannot authenticate an approval merely because the caller sends `approved: true`.

## Policy and inputs

The owner adopted 35% target contribution margin, 25% minimum and £3 minimum cash contribution for the conservative single-item sale. `TLL_POLICY_VALUES` exports those values in basis points and pence. The calculator still requires a valid policy approval record; importing the constants cannot enable execution.

The £5 supplier delivery amount is a separate fixed fact, **500 pence for every approved billable sellable quantity**. Quantity five incurs 2,500 pence, including when customer shipping is free. A multipack can be one billable item only when its supplier unit definition has been approved. Unknown definitions produce HOLD.

Each wholesale/delivery/additional-cost component declares its approved tax basis, VAT rate and input-tax recoverability. The module does not infer these from `VAT`, `Zero`, Shopify flags or UK location. For example, explicitly approved inclusive/recoverable 20% VAT converts 500p to the exact economic amount `1250/3` pence; exclusive/unrecoverable 20% gives 600p. The original supplier amount remains 500p in the result. These are supported examples, **not the actual supplier tax policy**.

All monetary inputs are integer GBP pence. Rates use integer basis points. Explicit zero is permitted for genuinely absent fixed fees, additional fees, reserves and customer shipping, but wholesale, sellable quantities and minimum cash contribution must be positive. Every relevant record includes a version, separately supplied expected version, approval flag and effective/expiry times. `nowMs` is an explicit input, so replaying the same record set and time reproduces exactly the same result. An expiry is exclusive: at `nowMs == expiresAtMs` the record is held.

A cost-record approval represents approval of the **complete attributable cost scope** for the scenario, including distinct additional supplier/packaging fees and economic returns reserves. Do not mark a quote approved while supplier fees or tax treatment are missing. This foundation models additional costs per sellable item; a scenario with an unmodelled per-order, split-fulfilment, remote-area or refund cost is ineligible for use until that cost is correctly represented and approved in a later extension. It must not be silently represented as zero.

## Single-item floor

`calculatePriceFloor(input)` returns the lowest whole-penny list price whose actual half-up-rounded percentage discount leaves enough gross receipts to pass both the minimum-margin and minimum-cash tests. It also returns a separate target-margin floor, the binding minimum rule, exact economic cost, discounted gross/net revenue, contribution and all approval versions. `dependencyValidity` records the latest effective start and earliest exclusive expiry across the cost, pricing-policy and payment approvals. A later projection must preserve this window and compare the recorded dependency versions against the current approved versions; reviewing or caching the result cannot renew its source approvals.

The continuous formula from implementation-plan section 9 establishes the required contribution:

```text
margin floor = C / ((1 - d) × ((1 - m) / (1 + v) - f))
cash floor   = (C + K) / ((1 - d) × (1 / (1 + v) - f))
continuous floor = max(margin floor, cash floor)
```

Before returning an executable penny price for this simulation, invert its actual receipt rule `gross = P - roundHalfUp(P × d)`. First calculate the required undiscounted gross receipts `G` by taking the maximum cash/margin gross requirement and rounding it upward to a penny. The exact minimum is `floor((G - 0.5) / (1 - d)) + 1`; the strict boundary preserves half-penny discount ties. Apply this independently to minimum and target floors. Merely rounding the continuous formula can be one penny too low when the discount itself rounds upward.

`C` includes one supplier delivery fee, wholesale, other attributable unit costs, reserve and one fixed payment fee. `d` is the maximum allowed discount, `v` output VAT, `f` the variable fee on gross receipts, `m` minimum/target margin and `K` minimum cash contribution. The conservative item floor receives **no customer shipping credit**.

Using the plan's synthetic reference costs of 1,000p wholesale, 500p economic delivery, 25p fixed payment fee and 50p reserve, with 20% output VAT and a 2% variable payment fee, the minimum floors are **2,604p without discount** and **2,893p permitting 10% discount**. The no-discount 35% target floor is 3,020p. No test fixture establishes the actual payment provider tariff or supplier VAT treatment.

## Whole-basket assessment

`evaluateBasket(input)` validates every line against its conservative single-item floor as well as the combined basket. A high-margin line or customer shipping charge cannot hide a different line with a below-floor list price.

- Supplier delivery and all unit costs scale with quantity; the basket subtracts the fixed payment fee **once**.
- Net revenue uses each line's approved output VAT rate. Customer shipping is separate gross revenue with its own approved, versioned tax policy. Variable payment fees apply to product **and shipping** gross receipts.
- Apply the specified percentage discount to the gross line total, round its discount amount half-up to a penny, then subtract the explicit fixed discount allocation. The fixed allocation includes any codes or reward redemption attributable to that line. Discounts cannot exhaust revenue or exceed the approved maximum, including its corresponding penny rounding. These are explicit simulation semantics; a Shopify integration must compare actual promotion allocations rather than assume every checkout uses this order.
- The default cash safeguard is £3 multiplied by billable quantity. This is a **derived conservative basket safeguard**, not a separately approved general order-level policy. A later order-specific minimum requires the optional `orderCashPolicy` with its own valid approval record. Each item's conservative floor still applies.
- Every actual discounted line must also pass the minimum margin and £3 × billable quantity cash tests on the same conservative cost basis used by the item floor, including the full fixed payment fee per item. A floor calculated with single-unit discount rounding is not sufficient proof for quantity-level line rounding. Failing lines receive `BELOW_LINE_MARGIN` or `BELOW_LINE_CASH`, even if other products or customer shipping make the overall basket profitable. An approved lower order cash minimum does not remove this item safeguard.
- `conservativeLineContributionPence` and `minimumLineCashPence` expose that gate basis for explanation; they are not additional ledger charges.
- Fixed payment-fee reporting allocates the one charge proportionally to gross receipts across item lines and customer shipping. Exact line and shipping contributions reconcile to the order total. Margin is evaluated against total revenue excluding VAT.

Below-floor lines, failed actual-line contribution tests, excess discounts or failed basket margin/cash tests return `eligible: false` with explainable HOLD codes and the computed assessment when available. Invalid or incomplete inputs return a HOLD without a calculation. The module never clips invalid values into acceptable ranges. Sparse line arrays are rejected before aggregation, and a basket must contain at least one billable item; shipping-only receipts cannot create an eligible product basket.

## Precision and release limits

Arithmetic uses reduced BigInt rational fractions; there is no floating-point division of money. Input and result amounts are bounded to `MAX_PENCE` (1,000,000,000 pence), baskets to 100 lines and 10,000 total billable units. Exact outputs serialize as decimal-string numerator/denominator pairs, with no BigInt values escaping in JSON. Contribution margin is a dimensionless fraction.

VAT and variable payment fees remain exact in this foundation; actual invoice/payment-provider penny rounding, promotion allocation, refunds and non-refundable fees must be revalidated against the selected checkout/payment configuration before activation. The calculator is not a checkout extension, live inventory check, competitor matcher or transaction guarantee. Current cost, policy and payment versions and their dependency validity must be re-read immediately before any future price mutation. Existing manual holds, product/variant matching and independent execution switches remain separate requirements.

Verification: 52 Node tests passed, including independent integer cross-multiplication of lowest-penny boundaries across 30 VAT/discount/cash cases and 80 minimum/target one-item basket replays, mixed VAT, fee reconciliation, fixed/percentage promotions, the 500p × quantity rule and missing/unapproved/stale/expired/overflow inputs. Run:

```sh
node --experimental-strip-types --test tests/pricing-policy.test.mjs
```

The rounding regression is covered explicitly: the reference costs with a 0.02% discount require 2,605p, because the old 2,604p result loses a full penny of discount and misses the minimum margin. The standard 2,604p/2,893p reference scenarios remain valid.

The module also passes strict TypeScript checking with the repository's ES2017 target; no package or lockfile changes are required.
