# Integrated staging candidate

This candidate combines the separately reviewed catalogue, pricing, accessible UI, retailer-link, scoring-contract, saved-stack and Shopify-adapter changes above the Stage 0 security baseline. It is a staging integration candidate; it does not establish a completed unified storefront or permission to release production.

## Resulting behaviour

- Product identity, stock observations and cost evidence have explicit eligibility states. Unknown VAT basis cannot authorize a price. The cost calculator includes the configured delivery amount for every billable item quantity and preserves integer-pence margin floors.
- Retailer listings are labelled as listings. An unresolved or unapproved own-shop mapping has no purchase action. Research-stack links do not imply a combined checkout.
- Missing and review-held assessments are excluded from rankings and recommendations. Other historical scores are labelled as legacy values, not newly approved science. Personal stacks, share images and captions apply the same boundary using catalogue identities.
- Navigation and dialogs preserve keyboard focus, hide closed controls and fit the tested widths. Stack budgets describe the initial pack purchase; they do not imply a verified monthly consumption cost.
- Saved stacks use one active stack per account, additive idempotency and version-checked destructive operations. Migration 003 preserves duplicate-stack repair evidence and blocks direct browser table writes.
- The Shopify adapter checks exact inventory identity and creates guarded change plans. It has no default transport, runtime caller or enabled mutation path. Durable worker execution and restart recovery are separate work.

## Integration review

The stack/UI merge preserves both accessibility and database stack CI jobs. It retains shared stack state, loading/busy controls, retries, accessible-dialog focus handling and the retailer-listing boundary. The assessment follow-up adds an IDs-only public read route and resolves catalogue values rather than trusting stored or caller-supplied scores.

Before the documentation commit, the combined implementation at `46c6f21698221cbf680aba932d59f7663402941e` passed 732 unit tests, TypeScript checks, lint with zero errors and six existing warnings, seven real local Next auth-route tests and browser component checks at 320, 390, 768, 1024, 1280 and 1440 pixels. The real Next build/runtime isolation check also passed with zero external connections. The browser suite uses synthetic adapters and a fresh headless browser profile; it is not hosted identity/cart or native assistive-technology acceptance.

## Remaining release gates

1. Complete authenticated pending-addition reload durability. An uncertain signed-in addition currently lacks a durable retry record; guest-merge persistence does not prove this case. Bind replay to the original verified account and test account changes and lost responses.
2. Deploy this exact combined client to isolated staging and verify concurrent browser journeys. Migration 003 and nine direct hosted RPC cases have passed in staging, but those checks do not prove this client.
3. Obtain and rehearse a restorable private production backup, review migration impact and rollback, and satisfy the Stage 0 release checks before any production migration or app release.
4. Review exact commercial mappings, supplier cost/tax evidence, label provenance and stock semantics before enabling commerce projections or automation. Finish durable inventory/order workers and their outage/reconciliation tests.
5. Implement and verify the isolated Shopify customer-account and cart prototype, then consent/email and approved evidence publication. No existing synthetic test is acceptance for those features.

Production price changes, supplier dispatch, customer-email activation, production theme publication and production application/database deployment are not performed by this candidate. The finding register remains open until its recorded acceptance evidence is met.
