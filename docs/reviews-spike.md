# S08: Shopify store reviews only — offline spike

12 October 2026. Written on `codex/s08-spike`, starting at `f36a7d27`; common ancestor with `codex/tll-integration`: `cdf9f296`. This is a recommendation for Toby to review, not an installed or working integration.

## Recommendation and evidence limits

Use Judge.me's free plan (commonly called **Forever Free**) provisionally. Keep review collection and moderation in Shopify; TLL should display the same published product rating and count, labelled **“Shopify store reviews”**, with a link to the mapped store product. Follow Toby's store-only decision in [TASK-QUEUE.md](launch-pack/TASK-QUEUE.md#decision-toby-11-oct-2026-2036-s08--shopify-store-reviews-only). Do not combine native TLL reviews with store reviews or import the native records into Judge.me.

No network calls were made. The queue records Judge.me's public widget/API and the retirement of Shopify Product Reviews. The provider comparison below uses prior general documentation knowledge, which may be outdated; this repository has no saved provider documentation establishing current free-plan API entitlement, off-store embedding rights, authentication, response fields or rate limits. **Free widget availability does not prove free API availability.** Confirm these before building a real transport. No exact API URL or response contract is assumed here. Related draft PR state was not refreshed because this task prohibits network calls; local searches found no existing Judge.me integration.

| Option | What it offers / possible fit | Limits and decision |
| --- | --- | --- |
| Judge.me free public widget | Prior documentation describes product review widgets and star badges. A widget handles its own layout and published reviews. | Check free entitlement, embedding on a separate Next.js domain, required public token, accessibility, consent and branding. A self-refreshing widget may bypass TLL's one-hour cache control. Prefer it in Shopify; use on TLL only if these requirements can be demonstrated. |
| Judge.me public/read API | Could let TLL fetch only rating and count on its server and use its own cards/pages. Best fit for controlled caching and existing UI. | Confirm a supported free read endpoint exposing the same published-product aggregate as the store, its token scope, permitted reuse and limits. Some API operations may need a private token or paid plan. Do not scrape widget HTML or substitute an undocumented endpoint. |
| Judge.me paid plan | Prior documentation calls this Awesome and describes additional features/integrations. | No paid installation, upgrade or trial here. If necessary API access is paid, stop and return the exact requirement to Toby; do not assume approval. |
| Loox | Prior documentation describes Shopify review widgets, especially photo reviews. | Treat as a paid candidate, not an established free solution. Current price, API access and off-store display rights are unverified; adds no demonstrated benefit for this rating/count scope. |
| Yotpo / Stamped | Prior documentation describes Shopify review collection/widgets, with plan-dependent features and integrations. | Free entry options have existed, but current availability, limits and API entitlement are unverified. Consider only if Judge.me cannot meet this scope without spend. |
| Shopify Product Reviews | Old first-party app; the local queue says it is retired. | Do not build against it. Shopify product/variant data alone is not a universal reviews API. |

Decision rule: choose Judge.me free only once a supported read method and matching store aggregate are confirmed. If the free API is unavailable, retain the flags OFF and take the choice back to Toby: a supported free off-store widget, another free provider, or separately approved paid access. This spike authorises none of those installations.

## What exists locally

- [The native summary route](../app/api/products/reviews-summary/route.ts) reads the Supabase `reviews` table and returns average, count and latest text, keyed by TLL product ID.
- [ProductGrid](../app/products/ProductGrid.tsx) fetches that route and renders stars/count/snippets on browse cards.
- [ProductDetailPage](../app/products/[id]/ProductDetailPage.tsx) mounts [ReviewSection](../components/ReviewSection.tsx), which reads/submits through [the native reviews route](../app/api/reviews/route.ts). Submissions currently award points.
- [The product server page](../app/products/[id]/page.tsx) independently reads native ratings for `aggregateRating` in JSON-LD: hidden page data search engines can read. Hiding the visible review component alone leaves this rating exposed.
- [product-mapping.ts](../lib/commerce/product-mapping.ts) already defines saved rows, `toExactMapping`, `canonicalShopifyId` and `presentStoreLinkMapping`. Its TODO says the approved runtime database loader is still missing. Local migration/seed files exist; no hosted installation or approved real data is established by this spike.

## Mapping a rating to the correct product

Use T04/T05's approved saved mapping, not a second reviews mapping table or historical CSV/name matching. Reuse [ExactMapping](../lib/commerce/catalogue-eligibility.ts) and the helpers in `lib/commerce/product-mapping.ts` on the server.

1. Resolve `comparison_product_id` to reviewed store rows; apply the existing active/store, approval, exact identity, matching version and unexpired review checks. `toExactMapping` validates shape; it does not alone establish approval. Reuse the checks in `presentStoreLinkMapping` while retaining the Shopify product ID privately on the server.
2. Read `ExactMapping.shopifyProductId` for the reviews lookup. Judge.me product reviews are expected to aggregate at Shopify **product** level; a Shopify **variant** identifies a particular flavour/pack and is not interchangeable with a product ID. Confirm provider semantics from a real read before binding.
3. Reuse `canonicalShopifyId` to normalise product IDs. If the provider requires the numeric suffix, keep it as a decimal string; never turn large Shopify IDs into JavaScript numbers. Never send the variant ID as the product lookup ID.
4. Several mapped variants/supplier offers pointing to the same Shopify product share one fetch and one aggregate; never sum their counts. Label it as product-level store reviews, potentially covering multiple flavours/packs, not verified feedback on the selected variant.
5. If a TLL product resolves to more than one distinct Shopify product, withhold the aggregate until Toby/Lifty choose and approve the intended relationship. Missing, expired, ambiguous, affiliate-only or unapproved mappings show no store rating. Do not silently average across store products.
6. Match provider responses to the requested shop/product and use only the store's published review population. Check finite average in 1–5, non-negative integer count and consistent zero-review representation. Zero reviews means no stars/aggregateRating; an error is not a zero-review result.

Expose only TLL product ID, source, average/count, freshness information and the approved public product link. Keep full mapping rows, costs, supplier identity and tokens off the browser and logs. This reviews lookup must not change price, stock or existing purchase eligibility. Customer opinion must remain separate from TLL's scientific assessment; it must not alter Effectiveness Match scores or ranking.

Do not label every review “verified purchase”. A store aggregate can include reviews without that badge; use verified-purchase wording only where the provider supplies evidence. Toby/Lifty must confirm moderation, imported-review provenance and the intended review population.

## One-hour cache plan

Caching means keeping a temporary copy so every visitor does not cause another provider request. Future server implementation should cache a validated published summary for **at most 3,600 seconds**, keyed by provider + canonical shop domain + canonical Shopify product ID. Keep mapping selection/version checks outside the provider cache; changing or withdrawing a mapping immediately removes that TLL association.

- Preserve `observedAt` and a fixed `expiresAt`; repeated reads must not extend expiry. Prefer any provider observation timestamp when available and reject data already too old. Local fetch time cannot prove how fresh the provider's own aggregate is.
- Deduplicate simultaneous requests for a key and fetch each Shopify product once per batch; no provider scripts or private requests per browse card.
- At age **greater than or equal to 3,600 seconds**, fetch again before returning a rating. Do not serve an expired rating while refreshing or after a provider error. Use a short bounded timeout; omit the rating on timeout, malformed response or rate limiting. Brief negative/error caching may avoid request floods but never turn failure into zero reviews.
- Return `Cache-Control: no-store` from the future TLL summary route and prevent a page/CDN/browser cache from adding another hour. Server cache expiry must be checked explicitly; a framework revalidation interval alone may serve stale values. Send expiry to long-open client pages so they clear/refetch ratings at expiry. Search metadata must obey the same deadline.
- If the provider only exposes an autonomous widget, confirm its freshness guarantee and controls first. Do not claim a hard one-hour bound from a widget's presence or from an API that serves older provider snapshots.

TODO(build): choose the smallest existing server cache approach that enforces the deadline in the deployed environment; no new database, queue or scheduler for this spike. Inject a fake provider and clock for tests. Cache behaviour, live provider freshness and deployment behaviour are unproved here.

## Hide native reviews reversibly behind a flag

Proposed server flag: `TLL_STORE_REVIEWS_ONLY`, default **OFF** (unset or any value other than exact `enabled`). This name is a proposal only; no flag or environment setting is added by this spike. A feature flag is a switch that lets us enable a behaviour without deleting the old implementation. Pass its resolved boolean from the server to client components; do not create independently configured browser/server switches.

| Area in the later build | OFF | ON after approval |
| --- | --- | --- |
| `app/api/products/reviews-summary/route.ts` | Preserve native handler. | Return an empty native summary before creating a Supabase client; `no-store`. Use a separate store-summary route/type so native text cannot be mistaken for store data. |
| `app/products/ProductGrid.tsx` | Preserve native fetch/UI. | Skip native fetch and hide snippets; show only validated, fresh mapped store stars/count from the new summary route. |
| `app/products/[id]/ProductDetailPage.tsx`, `components/ReviewSection.tsx` | Preserve native review section. | Do not mount the native component, including its form, sharing and points messaging; display the store aggregate/link instead. |
| `app/products/[id]/page.tsx` | Preserve existing native aggregate logic. | Skip `fetchReviewAggregate`; use the same fresh store summary for visible stars and `aggregateRating`, or omit the aggregate entirely. Preserve separate scientific/editorial code. |
| `app/api/reviews/route.ts` | Preserve all native handlers. | Proposed: return empty product-review GET before a database read; reject POST as disabled before inserting/awarding points. Keep authenticated `mine=1` access for the owner's historical records under existing checks. Toby to confirm this retirement policy. |

Keep all native functions, handlers, components, stored reviews, moderation rules and points history. No DELETE, data transfer, migration or removal of database access policies. When ON, provider failure/unmapped products show no customer rating; they **must not fall back to native TLL reviews**. Any full widget remains subject to the free-plan/caching checks above. Hiding the API response is not a claim that historical rows become private at the database level.

Rollback is a separately approved switch back to OFF, restoring the preserved native path; it would re-expose native reviews, so do not do it automatically during provider errors. New builds must test both modes. Nothing is hidden or switched by this documentation change.

## Toby's setup steps — later, after approving the spike

1. Approve Judge.me as the provisional provider and the product-level review label. Ask Judge.me to confirm free read API entitlement, exact shop/product aggregate endpoint, token scope, off-store display rights, cache/freshness limits and rate limits. Get the answer before any paid choice.
2. In Shopify Admin, install the official Judge.me Product Reviews app and explicitly select **Forever Free / free plan** if still offered. Check the current plan screen; decline paid upgrades/trials. Installation is Toby's later action, not performed here.
3. Review app permissions and settings. Leave review-request emails, imports and publishing/theme changes off until their specific approval. Configure the store widget in an unpublished theme preview first, and approve any eventual live theme change separately.
4. In the app's API/settings area, identify the supported read credentials. Proposed server environment names are `JUDGEME_SHOP_DOMAIN`, `JUDGEME_PUBLIC_API_TOKEN` and, **only if confirmed necessary**, `JUDGEME_PRIVATE_API_TOKEN`. These are TLL naming proposals, not guaranteed vendor setting names. Store secrets through the approved environment workflow; never paste values in this document, chat, source or tests, or put a private token in `NEXT_PUBLIC_*`. A public widget token may be public only when its documented scope is safe.
5. Toby/Lifty sign off five distinct mapped Shopify products, their exact IDs/handles and review provenance. Use approved T04/T05 records; do not guess from names or seed candidates. Prefer cases covering multiple variants, zero reviews and a meaningful review count when available.
6. Authorise the build ticket to implement the adapter, strict caching and flag plan with mocks first. Leave `TLL_STORE_REVIEWS_ONLY` OFF until the new path and native-hide tests pass. Set no credentials or live flags in this spike.
7. Separately authorise provider/store read checks. Record store widget rating/count and TLL result for all five at the same time, including product IDs, rounding and capture times; verify both cards and pages, plus metadata. Ensure five real mapped products match; local tests cannot satisfy this acceptance.
8. After those checks and hosted CI pass, explicitly approve the flag change and any theme publication. Confirm native display/requests/submissions are hidden, store-only failure behaviour works and the one-hour freshness limit holds. No spend without a separate decision.

## Build checks and remaining decisions

The later build should add mocked Node tests in `tests/*.test.mjs` for default OFF/ON, no native database reads in hidden public paths, POST/points suppression, preserved owner history, exact/expired/ambiguous mappings, large string IDs, variant deduplication, cross-shop isolation, provider product mismatch, zero reviews, malformed aggregates, rate limits, expiry just before/at/after one hour, no stale-on-error, mapping withdrawal and no native fallback. Add UI/metadata checks for consistent source, accessible stars/count and no native snippets/forms. Reuse `lib/commerce`; do not introduce `lib/mapping` or a separate mapping authority.

**Decisions needed:** Toby approves this spike/provider and later flag activation; provider documentation must establish free read access and freshness; Toby/Lifty approve real mapping data and review provenance; Toby confirms native submission retirement with owner history retained. Credentials, app installation and real five-product comparison remain external steps. No implementation stub is added because guessing an unconfirmed API contract would not resolve those gaps.

Local validation (documentation-only change): `node --experimental-strip-types --test tests/product-mapping.test.mjs tests/seed-mapping.test.mjs tests/catalogue-eligibility.test.mjs tests/staging-live-boundary.test.mjs` — **183 pass, 0 fail, 0 skipped**. `npm run check:live-boundaries` — **PASS, 0 violations**. These exercise existing offline mapping/eligibility and boundary checks; they do not test an installed reviews provider, new cache or new flag. Hosted CI and live acceptance were not run. No commit attempt, push, merge, deployment, environment edits, hosted migrations, live service calls or spend.
