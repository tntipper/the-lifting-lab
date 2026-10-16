# TLL Task Queue (v2)

Default base branch: `codex/tll-integration` until T13; explicit ticket or Toby branch instructions take precedence. One ticket = one branch = one PR. Estimates are hands-on days.

## Target timeline
| Week | Tickets | Milestone |
|---|---|---|
| 1 (from 12 Oct) | T01, T02, T03, start T04 | Decisions reconciled; docs in the repo |
| 2 | T04, T05, T11 (in parallel) | Approved catalogue and mapping |
| 3 | T06, T07, T08 | Site shows store offers, prices and stock; TropShip sync running |
| 4 | T09, T10, start of 3-day evidence window, T12 | **Soft open (password off) at end of week 4**, with supervised dispatch |
| 5 | T13, T14 | Unattended dispatch after 3 clean days; Bodypower/PowerBody adapter |
| 6 | T15, T16 | **Full launch**: accounts and stack-to-cart; supplier 3 |

### T01: Reconcile and decide (1 day)
- **Goal:** one page, `docs/ops/2026-10-reconcile.md`, recording the decisions: £4.99 delivery with absorbed dispatch and the multi-supplier rule; the Option B harness; the 3-day window; the mapping of draft PRs #54 and #60–#66 (keep, merge order or park, with the stacked chain #61 → #63 → #64 noted); local uncommitted changes (what to commit or stash); the v18 status (diagnose only; it doesn't block the store launch); brand price vs RRP terminology.
- **Acceptance:** Toby signs off the page. Nothing is merged or closed without his approval.
- **Out of scope:** code changes.

### T02: Docs into the repo (0.25 day)
- **Goal:** make `docs/launch-pack/` the single location for [LAUNCH-DEFINITION.md](LAUNCH-DEFINITION.md), [HARNESS-SPEC.md](HARNESS-SPEC.md), this task queue and [HOW-TO-RUN-CODEX.md](HOW-TO-RUN-CODEX.md). Reconcile the [root AGENTS.md](../../AGENTS.md) with still-valid content from `git show 42a16dd:AGENTS.md` and the repo; keep it concise. Replace this folder’s AGENTS.md with a root pointer, ensure [CLAUDE.md](../../CLAUDE.md) references it, and add a short [README index](README.md).
- **Branch:** `codex/t02-docs`, based on `codex/t01-reconcile`; stay on it.
- **Acceptance:** files are consistent, links resolve, `git diff --check` and `npm run check:live-boundaries` pass. Prepend a note of 10 lines or fewer to `.agent/HANDOVER.md`, preserving all existing content.
- **Delivery restriction:** leave changes in the working tree; do not attempt a commit in this sandbox (Git writes are blocked). Do not push, merge, deploy, change env vars, call live Shopify/supplier APIs or flip live flags. Hosted CI and a PR are deferred until authorised Git access is available.

### T03: Integrate the approved fix PRs (1 day)
- **Goal:** merge the chain T01 approved (for example #61 → #63 → #64, #66 dependency/lint fixes, #54 eligibility wording) in order.
- **Acceptance:** CI is green after each merge. No feature is enabled.
- **Out of scope:** #60/#62 owner-journey work unless T01 approves it.

### T04: Exact TropShip catalogue review with compliance (3–4 days, with Lifty)
- **Goal:** a decision for each of the 59 products / 70 variants (approve, hold or exclude) using `docs/research/data/comparison-shopify-supplier-reconciliation-2026-09-25.csv` and the 03 Oct catalogue drafts. Resolve `STM008`. Do the claims, warnings, novel-food and WADA review here.
- **Acceptance:** every row has a decision. 20 approved rows are verified by hand. The compliance column is signed by Lifty.

### T05: Saved mapping table on ExactMapping (1.5–2 days)
- **Goal:** a migration and repository for approved mappings (one row per variant per supplier offer, private cost kept separate), plus `npm run mapping:check` and the T04 approvals loaded.
- **Files:** `supabase/migrations/*`, `lib/commerce/catalogue-eligibility.ts`, `scripts/mapping-check.mjs`, `tests/mapping*.test.mjs`.
- **Acceptance:** 0 errors, no duplicate variants, and the tests pass.

### T06: Store offers on all site surfaces (2 days)
- **Goal:** `ProductOfferLink` / `resolveProductListing()` link approved offers to the exact Shopify variant. Affiliate links appear only where there is no approved offer. Out-of-stock approved offers show "Out of stock".
- **Acceptance:** browser tests check 10 approved products (handle and variant ID), 3 products without offers (affiliate) and 2 out-of-stock offers (no affiliate swap).

### T07: Shopify price and stock on the site (2 days)
- **Goal:** production Storefront reads (2026-07, batched, 15-minute cache), generalised from the staging cart code. Replace `retail_price` on approved offers. True Cost uses the approved price.
- **Acceptance:** mocked tests pass. A staging price change shows on the site within 15 minutes.

### T08: Harness core and TropShip stock/price sync (3 days)
- **Goal:** `lib/commerce/harness/` with types, the TropShip adapter (strict parser built on `supplier-feed.ts`), the hourly sync, stale-stock expiry, diffs and runs. Dry run by default.
- **Acceptance:** fixture diffs match. A malformed feed is rejected with an alert. Expiry sets stale rows to unavailable. Prices change only where `price_auto` is set.

### T09: Manual queue and alerts (1.5 days), before forwarding
- **Goal:** the queue table, the `/admin/harness` page, alerts and the daily digest (including absorbed shipping).
- **Acceptance:** a forced error creates a queue item and an alert within 5 minutes. Non-admins get 403.

### T10: Order routing and TropShip submission (3 days)
- **Goal:** webhook (raw-body HMAC, saved before acknowledging) → fresh order read → reservation → group by supplier → submit (statuses submitted, accepted, uncertain) → private address store. Ports the connector's spent-marker and recovery logic.
- **Acceptance:** a replayed webhook makes no duplicate. A cancelled order gets no submission. A mixed basket is split, with the absorbed shipping lines recorded. A timeout goes to uncertain and the queue with no resubmit. The supervised staging order succeeds.

### T11: Bodypower / PowerBody discovery (1–2 days, alongside T04)
- **Goal:** confirm the supplier's identity (Bodypower vs PowerBody), access, dropship terms, feed format, ordering method and catalogue coverage (EAN match against the comparison catalogue). Read only.
- **Acceptance:** a one-page report and coverage CSV.

### T12: Tracking write-back and the launch rehearsal (2 days)
- **Goal:** the tracking job (explicit lines, partial shipments), then Gates A–E, including **one real paid order approved by Toby** with refund.
- **Acceptance:** all gate evidence is linked. Toby removes the password (soft open, end of week 4).

### T13: Consolidate the repo out of iCloud (0.5 day, after soft open)
- **Goal:** a planned move that keeps the linked worktrees and the sibling `implementation-state/` private data, ending on one clean clone with main as the base.
- **Acceptance:** the build passes from the new location, the old folder is archived (not deleted), and Vercel is unchanged.

### T14: Bodypower/PowerBody adapter (2–3 days)
- **Goal:** the adapter from the template, its mapping rows and compliance review for new SKUs.
- **Acceptance:** the same tests as T08/T10 with a fixture, and a 3-day evidence window for this supplier.

### T15: Customer Accounts link and My Stack add-to-cart (2–3 days)
- **Goal:** link Shopify Customer Accounts to site profiles by verified email, reusing `lib/identity/*` and the callback route. My Stack adds to cart through the Storefront cart.
- **Acceptance:** a test user signs in, adds their stack to the cart, checks out on staging and sees the order. No duplicate profiles.

### T16: Supplier 3 adapter (TBC, likely Bodyshocker) (2–3 days)
- **Goal and acceptance:** as for T14.
