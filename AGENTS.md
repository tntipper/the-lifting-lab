<!-- Replaced on branch codex/t01-reconcile (11 Oct 2026) with launch pack v2. Previous version: git show 42a16dd:AGENTS.md -->

# AGENTS.md: The Lifting Lab (TLL)

## Purpose
TLL is a UK evidence-based supplement comparison site (Effectiveness Match, True Cost, My Stack) at theliftinglab.co.uk, plus a Shopify store at shop.theliftinglab.co.uk, dropshipping from suppliers. The canonical project docs are indexed in [docs/launch-pack/README.md](docs/launch-pack/README.md); the launch goal is in [LAUNCH-DEFINITION.md](docs/launch-pack/LAUNCH-DEFINITION.md). Target: soft open at week 4, full launch at week 6.

## Start of every task
1. Read the top of [.agent/HANDOVER.md](.agent/HANDOVER.md), the assigned ticket in [TASK-QUEUE.md](docs/launch-pack/TASK-QUEUE.md), and [completion-tracker.md](docs/ops/completion-tracker.md) for historical evidence. The launch pack governs current scope; older plans may be superseded.
2. Run `git status`. Confirm the assigned working branch and its base. The default base is `codex/tll-integration` until T13; follow any explicit ticket or Toby branch override and stay on the assigned branch.
3. Search for existing code before writing new code (`lib/commerce/`, `lib/identity/`, `components/`), and check the related draft PRs.

## Architecture
- **Site:** Next.js 15.5 (App Router), TypeScript, Tailwind 4, Supabase, Vercel. Next 15.5.25, Node 24 / npm 11. Do not assume APIs, conventions or file structure from another Next.js version; check official Next.js 15 docs and deprecation notices before using unfamiliar APIs. This checkout has no `node_modules/next/dist/docs/` guides (the old AGENTS.md pointed there).
- **Store:** Shopify. The Admin and Storefront APIs are pinned to **2026-07** in the existing adapters. Don't upgrade silently.
- **Supplier harness (planned):** TypeScript under `lib/commerce/harness/`, reusing `lib/commerce/` (Option B); see [HARNESS-SPEC.md](docs/launch-pack/HARNESS-SPEC.md). The Python `tll-supplier-connector` is reference only. Port its logic; don't run it.

## Source of truth
- `ExactMapping` (a TypeScript type in `lib/commerce/catalogue-eligibility.ts`) defines a mapping. T05 will build the saved mapping table on it as the only runtime mapping source; that table is not implemented yet. One row per variant per supplier offer. Historical CSVs in `docs/research/data/` are inputs, not the source of truth.
- Shopify holds the live price and stock customers see. The launch requirement is that approved store offers never show `retail_price` (T07); do not treat this as proof the site is already wired to Shopify.
- Private costs, supplier data and customer addresses never appear in public product data or logs.

## What Shopify owns (no custom equivalents)
Checkout, payments, tax, customer accounts for purchase, order emails, refunds and returns, discounts, the theme and the delivery charge (£4.99 flat).

## Pricing rule
The customer pays £4.99 delivery per order. TLL absorbs the supplier dispatch charge (TropShip £6 per supplier order), to be recorded using `lib/commerce/pricing-policy.ts` / `lib/commerce/commercial-burden.ts`. These are local calculations, not proof of live delivery settings or multi-supplier routing. For multi-supplier baskets, each extra supplier order is another absorbed dispatch line.

## Planned harness adapter contract
```ts
interface SupplierAdapter {
  id: 'tropship' | 'bodypower' | 'supplier3';
  fetchCatalogue(): Promise<SupplierProduct[]>;
  fetchStockPrice(skus?: string[]): Promise<StockPrice[]>;   // includes observedAt
  placeOrder(req: SupplierOrderRequest): Promise<SubmitResult>; // submitted | accepted | rejected | uncertain
  fetchTracking(refs: string[]): Promise<TrackingUpdate[]>;
}
```
Never resubmit an *uncertain* order automatically. A unique key in our own database does not stop the supplier receiving a duplicate. Credentials come from env vars only, by name.

## Folder map (paths relative to repo root)
| Area | Location |
|---|---|
| Pages / API routes | `app/`, `app/api/` (`app/api/cart/route.ts`, `app/api/account/orders/route.ts`) |
| Offer links | `lib/affiliate.ts` (`resolveProductListing()`), `components/ProductOfferLink.tsx` |
| Mapping and eligibility | `lib/commerce/catalogue-eligibility.ts` (`ExactMapping`), `lib/commerce/catalogue-presentation.ts` |
| Shopify Admin / reads / cart | `lib/commerce/shopify-admin.ts`, `lib/commerce/shopify-variant-snapshot.ts`, `lib/commerce/staging-cart-storefront.ts` |
| Supplier feed | `lib/commerce/supplier-feed.ts`, `scripts/plan-supplier-feed.mjs` |
| Inventory ledger | `lib/commerce/inventory-ledger.ts`, `supabase/migrations/202609150004_*`, `supabase/migrations/202609170009_*` |
| Pricing | `lib/commerce/pricing-policy.ts`, `lib/commerce/commercial-burden.ts`, `lib/commerce/competitor-price-check.ts` |
| Identity | `lib/identity/`, `lib/server/staging-customer*.ts`, `app/auth/customer/shopify/callback/route.ts` |
| Planned harness modules (T08–T10) | `lib/commerce/harness/` (not created yet: adapters, sync, routing, queue, alerts) |
| Migrations | `supabase/migrations/` |
| Tests | `tests/*.test.mjs` (Node built-in test runner), `tests/browser/`, DB test folders. CI is in `.github/workflows/ci.yml` |
| Canonical launch docs / supporting evidence | `docs/launch-pack/` / `docs/ops/`, `docs/research/` |

## Coding rules
1. One ticket from [TASK-QUEUE.md](docs/launch-pack/TASK-QUEUE.md) per branch and one PR. Use the assigned branch/base; otherwise use `task/NN-name` on the default base.
2. Run the ticket acceptance checks; code changes require Node or browser tests. CI must pass before merging. Report local checks separately from hosted CI; do not claim CI passed when it was not run.
3. If a step fails twice, **diagnose and report**: write down the cause, the evidence and a proposed fix in the PR or HANDOVER. Don't loop, and don't silently skip a task that others depend on.
4. Add no new safety layers, frameworks, queues, staging "generations" or arm/disarm cycles without a ticket. Add no scope (TikTok, repricing, new categories) without a ticket.
5. Live payments, theme, production prices, real supplier orders and publishing all need a flag **plus** Toby's explicit approval for that specific operation.
6. Keep secrets out of code, logs and PRs.
7. At the end of every task, add a note of **10 lines or fewer at the top of `.agent/HANDOVER.md`** (what changed, the evidence, what's next and any blockers). **Never truncate or rewrite the rest of the file.** No other handover documents.

## Definition of done (per task)
The ticket's acceptance tests pass, CI is green, the PR shows the evidence, the HANDOVER note is updated, nothing outside the ticket's scope is touched, and Toby can check it in 10 minutes.

## Parked (reference only)
- The Python `tll-supplier-connector` repo and its draft PRs #1–#2. Port the parser, recovery and idempotency ideas from them.
- The staging generation / arm-disarm machinery and the custom account broker. Keep their evidence; don't extend them.
- Competitor repricing, the TikTok channel and the custom email engine.
