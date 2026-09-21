# Stage 3 — Slice 5: bind canonical account to cart + guest→account transition

Date: 2026-09-21  
Base tip: `7f670cbc1b7ba8fb4a0a95caf1be93e0d8c44d76` (`codex/tll-integration`, after PR #49)  
Protocol: `docs/ops/project-stage-execution-protocol.md`  
Programme: Stage 3 wiring checklist — Slice 5 only

## Intended outcome

Close Slice 5 acceptance: bind the cart actor to the completed canonical account mapping through the App Router cart surface, and prove the guest→account transition is **explicit** (no silent reinterpretation of an old guest cookie as a merged account cart). Record measurable PASS/GAP for refresh, back navigation, duplicated requests, stale revisions, unavailable variants, and uncertain provider mutation without automatic resend. Do not claim Slice 6.

## Measurable acceptance

| Criterion | Proof |
|-----------|--------|
| Stage plan written before mutation | This file committed on the Slice 5 branch before implementation |
| Investigation: library vs mounted API route GAP recorded honestly | Evidence inventory table — no paper PASS for unmounted-only account bind |
| Cart App Router module is the surface under test for account bind | Tests load/invoke `app/api/cart/route.ts` exports through `stagingCartRoute` composition |
| Cart actor bound to verified canonical account UUID | Mounted GET/PATCH use deterministic account session from verified Supabase UUID; no guest capability cookie required |
| Explicit guest→account transition | Mounted GET with guest cookie + signed-in actor → `transition_required`; never guest quantities as ready account cart |
| Transfer / use_account through mount | Mounted POST `transfer` and `use_account` clear capability only after acknowledged outcome; no silent merge |
| Refresh / duplicate / stale revision / unavailable variant / uncertain mutation | Named proofs (mounted where feasible; library/browser cited with pointers) — no automatic resend |
| No access token / cart ID / credentials in client responses | Mounted response body secret-free check |
| `npm run check:live-boundaries` PASS; focused tests PASS | Commands in evidence |
| Evidence + `.agent/HANDOVER.md` updated | Secret-free PASS/GAP table; next = Slice 6 logout/orders + hosted browser stop-before-purchase |

## Explicit exclusions

- Slice 6 hosted browser journey / purchases / customer email / logout-orders UI beyond Slice 5 needs  
- Checkout handoff that places an order; Storefront buyer access-token attachment beyond docs-backed countryCode already present  
- Gen 20; live / run-live-once / keychain arming; native gates stay false  
- Production Supabase `wrhgscovsgsudtedbljr`  
- Hosted migration 014 enablement / cart runtime credential against staging  
- Destructive reset of preserved Mac cart fixtures (`tll_cart_account_v*`)  
- Paper PASS — unclosed items recorded as GAP with pointers  

## Authoritative starting state

- Branch tip: `7f670cbc1b7ba8fb4a0a95caf1be93e0d8c44d76` on `codex/tll-integration`  
- Thin wrapper: `app/api/cart/route.ts` → `stagingCartRoute`  
- Composition: `lib/commerce/staging-cart-server.ts` wires `currentActor` from `createServerSupabase().auth.getUser()`  
- HTTP transition: `lib/commerce/staging-cart-http.ts`  
- Library/SQL/browser coverage already extensive at tip (handler fixture, migration 014 PG suite, React fixture)  
- Hypothesis to verify: tip mount test for enabled Next cart uses `createServerSupabase` stub returning `user: null` only — **account bind + transition are unproven through the App Router composition**

## Assumptions requiring evidence

1. Handler-level `createCartHandler` tests prove transition semantics but do not alone prove `stagingCartRoute` binds the verified UUID into `currentActor`.  
2. Injecting a synthetic verified UUID via the existing cart `modules()` Supabase stub is sufficient offline proof; no hosted Supabase session.  
3. Hosted cart journey with real preview origin + migration 014 remains GAP.  
4. Browser “back navigation” coverage may be partial (account-switch / unmount discard); honest GAP if no history API case exists.

## Files / systems that may change

- `docs/ops/stage-plans/2026-09-21-stage-3-slice-5-cart-account-bind.md` (this plan)  
- `docs/ops/evidence/2026-09-21-stage-3-slice-5-cart-account-bind-acceptance.md` (+ JSON sibling if useful)  
- `.agent/HANDOVER.md`  
- `tests/staging-cart.test.mjs` and/or `tests/staging-cart-account-mount.test.mjs` — mounted account-bind + transition proofs  
- `lib/commerce/staging-cart-server.ts` only if a documented inert fixture seam is required (prefer extending existing `modules()` Supabase injection)

External systems: **none**.

## Pre-mutation checks

| Check | Proof |
|-------|--------|
| On expected tip | `git rev-parse HEAD` = `7f670cbc1b7ba8fb4a0a95caf1be93e0d8c44d76` before branch work |
| Gates off | `npm run check:live-boundaries` |
| Inventory gap | Confirm mounted route test is guest-only; account/transition tests use `createCartHandler` fixture |

## Failure / stop / recovery

Stop on desire to arm Gen gates, place orders, enable hosted cart migration, use customer email as identity, or expand into Slice 6 hosted browser purchase-adjacent journey. Preserve evidence; record GAP rather than paper PASS. Recovery: leave gates false; no live window. Do not run `tests/staging-cart-account/setup.mjs` against preserved Mac data.

## Independent review point

Diff limited to cart mount/account-bind tests + docs/handover (+ optional narrow server fixture seam). Reviewer confirms no live arming and no Slice 6 scope.

## Execution

1. Commit stage plan first.  
2. Inventory PASS vs GAP honestly in evidence draft.  
3. TDD: mounted account-bind + explicit transition through `app/api/cart/route.ts`.  
4. Map refresh/duplicate/stale/unavailable/uncertain proofs (extend only if mount gap is real).  
5. `check:live-boundaries` + focused tests.  
6. Evidence + HANDOVER; push PR to `codex/tll-integration`.  

Max attempts: one coherent PR. No live launcher.

## Post-execution

- Evidence PASS/GAP table with file/test pointers  
- HANDOVER: Slice 5 status, tip SHA, next = Slice 6 logout/orders + hosted browser stop-before-purchase  
