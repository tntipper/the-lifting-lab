# Stage 3 integrated review — 27 September 2026

Independent Astra review of the disabled source at `a561da1`. This is a review and corrected order of work, not approval to publish, arm or run a hosted window. The six existing untracked paths and every consumed one-use record remain untouched. Hosted state was not refreshed in this review.

## What is proved and what is not

The protected Preview was previously observed Ready with account/cart/checkout controls OFF. The local Generation 23 source and tests are substantial; the current branch has all activation switches OFF. Two supervised attempts stopped at their baseline before owner sign-in, cart, checkout or logout. Thus **Stage 3 customer acceptance has not passed**. A local simulated PASS and a read-only service receipt cannot substitute for the real joined browser journey or final shutdown proof.

## Blocking mismatch to correct before publication or arming

`scripts/staging-generation-23-owner-journey.mjs` navigates product, auth, dashboard, orders and cart using `immutableUrl` (lines 67–79, 94), and its protected-route helper attaches the bypass only there (lines 17–37). The application intentionally permits only the fixed branch alias as the staging browser origin (`lib/server/staging-preview-origin.ts:1–11`). Cart and admission reject requests from another origin (`lib/commerce/staging-cart-http.ts:54–56`; `lib/identity/customer-admission-browser-delivery.ts:60–65`). This can prevent guest cart and sign-in before the intended customer test begins.

**Narrow repair:** keep immutable deployment ID/URL/source as build evidence, but navigate the owner browser on the registered branch alias. Verify that alias resolves to the expected enabled deployment before, during and after the journey. Scope the Vercel bypass to that verified alias only. Do not widen accepted application origins or Shopify callbacks merely to accommodate the runner.

The current owner test makes browser navigation and waits succeed unconditionally (`tests/staging-generation-23-owner-journey.test.mjs:62–83`). The composite rehearsal uses a simplified baseline and separate account/cart fixtures rather than the actual joined browser route (`tests/staging-generation-23-composite-local-acceptance.mjs:422–430, 510–538`). Keep these useful unit checks, but add one mounted-route browser contract test that retains real cookies, Origin, fetch metadata and application handlers while faking only external Shopify/Supabase replies. Prove the registered alias succeeds and an immutable-origin application request is rejected.

## Acceptance gap

The owner runner currently stops after GET-only checkout and closes the browser (`scripts/staging-generation-23-owner-journey.mjs:112–135`). The Stage 3 acceptance document requires the unified POST logout and confirmation that the same session can no longer read orders (`docs/ops/staging-account-activation.md:94–98`). Add logout after checkout observation, before shutdown, and verify the configured return, invalidated session and inaccessible orders. Closing Chrome alone is not logout. Another empty browser returning 401/403/409 proves signed-out isolation, not separation between two authenticated owners; label that evidence honestly.

Check the GET-only checkout observer against a realistic Shopify checkout response and any same-shop redirect before relying on its synthetic page. Preserve the no-purchase boundary and do not broaden allowed methods.

## One completion sequence

1. Freeze one Stage 3 checklist: protected owner sign-in, identity/orders, guest cart transfer, exact staging item/price, GET-only checkout, POST logout, and verified final OFF/retired state.
2. Repair the browser origin and logout narrowly. Prove the actual joined customer route locally with mounted application handlers and fake external service replies. Check the checkout redirect assumption. Add only regression tests for concrete mismatches.
3. Inspect the remaining downstream service contracts once; run focused checks and one complete offline rehearsal, then independent integrated review. Reuse unchanged database and shutdown proofs.
4. Publish the final disabled source to the protected staging branch under its existing gate. Verify Ready source/deployment, alias, protection, OFF controls, and unused successor records.
5. Perform one fresh read-only baseline against that exact deployment using the actual route adapters. The prepared v5 diagnostic reads the *older* deployment and uses a separate predecessor transport; it is optional only if that earlier Supabase network error must be isolated before publication. It cannot replace this final baseline. Avoid both checks without a distinct reason.
6. Review the exact local one-hour arming change and run the supervised parent once with the owner present and a shutdown reserve. Preserve every one-use record. Do not mint another generation for a preparatory helper failure.
7. Declare PASS only from customer observations plus final provider, Edge, database/login, account/cart/checkout and held Preview/alias proof. An uncertain result requires read-only reconciliation; it is not proof that shutdown succeeded.

The previous successor plan lists contract review, disabled publication and then actual-baseline read (`docs/ops/stage-plans/2026-09-27-stage3-successor-window.md:18–22`). This is the main order. The earlier handover's “v5 first” wording is a diagnostic option, not a substitute for these gates.

Avoid further per-helper full-suite runs and independent reviews, repeated dashboard refreshes and historical handover additions. Batch review around the integrated customer journey and complete disabled package. Preserve working credential, database and recovery machinery unless a concrete failure requires a compatible change.
