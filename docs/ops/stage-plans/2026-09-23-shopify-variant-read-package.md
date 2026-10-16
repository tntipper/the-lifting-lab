# Shopify variant read package — offline stage

## Outcome and starting state

Create a bounded, injected-port Shopify Admin GraphQL read package for a full, unfiltered variant inventory. It should request an exact count before and after cursor pagination, bind each page to the expected shop and GBP shop currency, parse prices as integer pence, preserve product status, and pass the existing offline catalogue-receipt gate. It must return a fixed HOLD without partial catalogue authority on malformed, foreign, truncated, inconsistent or transport-failed evidence. The output is shadow evidence, never a customer price or a Shopify write.

Start from `codex/tll-integration` at `536d36a`. Verify branch, status, source pins and both false hosted native flags. Preserve unrelated untracked iCloud copies and `implementation-state/`. The existing receipt proves only internal consistency of supplied pages/counts. Shopify's current 2026-07 Admin API documents `productVariants` cursor pagination, `productVariantsCount(limit:null)` and `Count.precision`; `EXACT` can lag writes, so matching counts do not prove a transactional snapshot. `productVariantsCount` has no supported search fields, therefore this unit inventories **all** variants and retains parent product status. Source references: [productVariants](https://shopify.dev/docs/api/admin-graphql/latest/queries/productVariants), [productVariantsCount](https://shopify.dev/docs/api/admin-graphql/latest/queries/productVariantsCount), [CountPrecision](https://shopify.dev/docs/api/admin-graphql/latest/enums/CountPrecision), [pagination](https://shopify.dev/docs/api/usage/pagination-graphql).

## Boundary and acceptance

Allowed changes: pure/injected `lib/commerce/shopify-variant-snapshot.ts`, synthetic tests, this plan, `docs/ops/daily-price-checks.md`, generated activation manifest and `.agent/HANDOVER.md`. No route, credential lookup, environment read, implicit `fetch`, job, provider call, customer email, checkout action, supplier order, purchase, deployment, production/staging API call or Shopify mutation. The supplied request port returns parsed response objects and has no default implementation. Use fixed GraphQL query documents with `shop { id currencyCode }`, count `{ count precision }`, and unfiltered `productVariants(first, after, sortKey: ID) { nodes { id price updatedAt product { id status } } pageInfo { hasNextPage endCursor } }`.

Require expected shop GID, GBP, exact finite count <=250000 on both count reads, count equality, no GraphQL errors, valid page shapes, continuous unique cursors, no duplicate variant IDs, strict decimal money within the downstream planner's pence bound, valid calendar timestamps and product statuses. Cap pages at 1000 and nodes per page at 250. The scope identifier must be a module-owned constant for all variants, not caller-supplied. Parse all variants before filtering; pass the page/row/count data to the existing receipt gate. A PASS is internally consistent transport evidence, **not** proof of a stable transaction, public market price, customer shipping, sale eligibility or approved margin. Return `shadowUseAuthorized:false`, `automationEnabled:false`, `priceChangeAuthorized:false` always. Never call the competitor planner from this module.

## Verification, stop and recovery

Synthetic tests cover two-page success, exact-count disagreement, approximate count, foreign shop/non-GBP, malformed/error response, bad pence, changed page cursor, repeated IDs, missing terminal, empty catalogue, transport rejection and no partial output. Review the exact fixed query shapes against Shopify docs. Obtain independent read-only review for false PASS, source identity, pagination and price parsing. Run focused and full disabled tests, typecheck, lint, both manifest checks and live-boundary check. Correct evidence-backed findings then rerun affected checks. Stop and revise this plan if an authenticated live adapter, market-specific pricing, filtered count or new credential scope becomes necessary. No live invocation belongs to this stage. Record durable limits in the handover and stop at the stage gate.

## Review and closure

Independent review reproduced two false-PASS paths in the first draft:
`Date.parse` normalised an impossible calendar date, and caller-supplied scope
text could mislabel an unfiltered catalogue as active-only. Strict canonical
calendar validation and a fixed module-owned all-variants scope now HOLD those
inputs. The parser also bounds item price to the downstream planner's maximum
pence value. Focused 16/16 and full disabled 2,316/2,316 tests pass; typecheck,
both manifest checks and live-boundary checks pass. Lint has zero errors and
20 pre-existing warnings. Independent review returned GO for the offline
package. No Shopify or other hosted request was made.
