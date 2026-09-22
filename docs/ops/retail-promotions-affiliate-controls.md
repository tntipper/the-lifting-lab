# Retail pricing, flash sales and affiliate controls

This is the required Stage 6 contract for future Shopify pricing and marketing
automation. It adds no live Shopify write, discount, affiliate payout or
campaign. Every price and campaign remains held until the product cost,
supplier tax treatment, stock, mapping, payment tariff, TropShip tariff and
margin policy are current and approved.

## Retail price records

Every Shopify variant must have one versioned retail-pricing record containing:

- exact product and variant IDs, supplier SKU, pack identity and currency;
- approved economic cost and its dependency versions and expiry;
- ordinary selling price, optional defensible reference price, minimum floor
  and target floor in integer pence;
- intended start/end time, approver, reason and source snapshot;
- the maximum combined discount, commission and paid-marketing burden that the
  price can support; and
- the previous published value and resulting Shopify write receipt.

Reference or strike-through prices require separate evidence and review. The
system must not manufacture an RRP, inflate a comparison price or infer one
from a temporary selling price. A stale or incomplete record produces HOLD.

## Promotion and flash-sale records

Each promotion is an immutable campaign revision with a unique campaign ID,
named owner, eligible variants, customer eligibility, UTC start/end, stock
limit, order/usage limits, channel, percentage or fixed benefit, approved
budget and kill switch. The campaign planner must replay every eligible basket
through the current pricing policy using Shopify's actual penny allocation.

A flash sale may be scheduled only when every affected line still passes its
standalone minimum-margin and cash-contribution guards after all permitted
discounts, payment fees, supplier delivery allocation, commission and campaign
cost. Start and end workers must be idempotent, preserve before/after values,
verify Shopify readback and reconcile an uncertain write before another
attempt. Expiry must restore the reviewed successor price rather than assume
the price that existed when the campaign was drafted.

## Affiliate-specific codes and attribution

Outbound retailer links remain separate from affiliates referring customers to
the TLL Shopify store. A TLL affiliate record must include a stable internal
affiliate ID, approved public code, status, channel, contract version,
commission rule, affiliate-specific customer discount, attribution rule,
effective dates, budget and payout details held outside the public catalogue.
Codes must be unique, revocable and mapped to the internal ID; the visible code
is never the accounting identity.

For each order, the affiliate ledger must record the applied code, attributed
affiliate and campaign, eligible merchandise revenue, customer discount,
commission accrued, other campaign spend, refunds, cancellations, chargebacks,
commission reversals and final approved payout. Shipping, tax, gift cards,
excluded products and returned quantities must follow an explicit contract and
must not silently enter the commission base. Self-referral, duplicate
attribution, code leakage and orders outside the attribution window are held
for review.

Initial affiliate payouts require manual approval after the Shopify order and
refund window reconcile. No payout is inferred from a click or an unfulfilled
order.

## Discount stacking and margin authority

The promotion registry defines an explicit precedence and stacking matrix for:

1. ordinary retail price;
2. automatic or flash-sale price;
3. affiliate-specific discount code;
4. other customer or reward codes; and
5. any fixed order-level adjustment.

Unlisted combinations do not stack. Shopify's observed line allocations must
match the planned allocation before an order can be counted as commercially
approved. The combined customer discount, affiliate commission, platform and
payment fees, delivery cost and paid campaign spend must pass the product-line
and order margin safeguards. A profitable product or shipping charge cannot
hide a loss-making line.

## Spend, performance and budget controls

Affiliate and campaign reporting must reconcile, by affiliate, campaign and
code:

- clicks and consented attribution events;
- orders, units and eligible revenue;
- discounts funded;
- commissions accrued, approved, reversed and paid;
- fixed sponsorship, sample, platform and advertising spend;
- refunds, cancellations and chargebacks;
- contribution after product, payment and supplier-delivery costs;
- customer acquisition cost and contribution-based return on spend; and
- remaining daily, campaign and affiliate budget.

Hard budget limits must stop new eligibility or code use rather than merely
raise a report. Missing events, duplicate webhooks, attribution disagreement,
negative contribution or an unreconciled refund creates HOLD and an operator
alert. Personally identifiable tracking must follow the approved consent and
retention policy.

## Required delivery sequence

1. Define and approve the retail-price, campaign, affiliate, attribution and
   ledger schemas with synthetic fixtures.
2. Extend the pure pricing engine to model the full combined commercial burden
   and Shopify line-level rounding.
3. Add a read-only Shopify projection and shadow campaign/affiliate ledger.
4. Reconcile a full synthetic lifecycle: visit, code, order, partial refund,
   cancellation, commission reversal and payout approval.
5. Run the complete catalogue and planned campaigns in shadow mode, with zero
   Shopify price or discount writes.
6. Independently review security, margin, privacy and accounting behavior.
7. Enable narrowly scoped writes in staging, then run owner-controlled
   no-purchase and separately authorized purchase acceptance.

Production prices, discounts, affiliate codes, budgets and payouts remain
disabled until this sequence and the wider production release gates pass.
