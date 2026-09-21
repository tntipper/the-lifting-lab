# Stage 3 — Slice 6: logout/orders + stop-before-purchase journey evidence

Date: 2026-09-21  
Base tip: `d6a2d79e6e1af61fc71afe5c777ba82cbda5a322` (`codex/tll-integration`, after PR #50)  
Protocol: `docs/ops/project-stage-execution-protocol.md`  
Programme: Stage 3 wiring checklist — Slice 6 only

## Intended outcome

Close Slice 6 acceptance for **cross-provider logout/recovery and customer orders/account UI** through App Router mount proof and offline-safe UI proof. Attempt a controlled hosted browser journey with an owned test email **stopping before any purchase** only if secrets/Toby/live arming are unnecessary; otherwise record an honest **GAP**. Retire temporary access only if any temporary access was opened (none expected). Record exact source/deployment acceptance with PASS/GAP — no paper PASS.

## Measurable acceptance

| Criterion | Proof |
|-----------|--------|
| Stage plan written before mutation | This file committed on the Slice 6 branch before implementation |
| Investigation: library vs mount vs hosted gaps recorded honestly | Evidence inventory table |
| Customer logout App Router mount | Tests load/invoke `app/auth/customer/logout/route.ts` through fixture seam; logged_out Shopify redirect; held/uncertain clears cookies without provider redirect; cookies Max-Age=0 |
| Logout GET 405 / method surface | Only `POST` exported from logout route; legacy `app/auth/signout` GET 405 cited from existing integration proof |
| Orders App Router mount | Tests load/invoke `app/api/account/orders/route.ts`; bounded projection; custody closed; no access token in JSON |
| Orders/account UI offline-safe | Client projection parser (or browser fixture) rejects non-allowlisted shapes; page wires unified logout form |
| Cart checkout handoff without purchase | Cite existing staging-cart proofs: no `checkoutUrl` / no buyer access token in client responses |
| Hosted stop-before-purchase journey | PASS only with real owned-email steps + outcomes stopping before order place; else **GAP** with blocker named |
| Temporary access retired | N/A if none opened; else revoke and record |
| `npm run check:live-boundaries` PASS; focused tests PASS | Commands in evidence |
| Evidence + `.agent/HANDOVER.md` | Secret-free PASS/GAP; Stage 3 closed or remaining named |

## Explicit exclusions

- **No purchases** — stop before checkout complete / order place  
- Gen 20; live / run-live-once / keychain arming; native gates stay false  
- Production Supabase `wrhgscovsgsudtedbljr`; production deploy  
- Customer marketing email; using customer email as identity  
- Enabling hosted migrations 012–016 / provider activation solely for this slice  
- Destructive reset of preserved Mac cart/account fixtures  
- Paper PASS for unhosted or secret-gated journeys  

## Authoritative starting state

- Branch tip: `d6a2d79e6e1af61fc71afe5c777ba82cbda5a322` on `codex/tll-integration`  
- Library logout: `lib/identity/customer-account-logout*.ts` + docs; route `app/auth/customer/logout/route.ts`  
- Library orders: `lib/identity/customer-orders.ts`, account-operations, `app/api/account/orders`, `app/account/orders`  
- Route dispatcher proofs: `tests/staging-customer-route.test.mjs` (injected runtimeFactory — **not** App Router mount fixture)  
- Mount seam: `TLL_CUSTOMER_AUTH_MOUNT_FIXTURE` + `STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY` (Slices 3–4)  
- Gates: `generation19Armed` / `ReplayPermitted` = false  
- This agent environment: no Toby credentials, no Vercel preview arming env, no staging customer feature enablement  

## Assumptions requiring evidence

1. Tip route-file test imports logout/orders but only proves fail-closed 409 without config / export shape — **enabled mount outcomes through App Router modules are unproven**.  
2. Hosted journey requires owner-controlled email + preview with customer flags / migrations / Shopify logout URI — **expected GAP** in this cloud agent without Toby/secrets.  
3. Cart “checkout handoff without placing an order” is already covered offline (no checkout URL emitted); re-cite, do not expand cart scope.  
4. Legacy `/auth/signout` GET 405 remains covered by `tests/integration/auth-routes.test.mjs`; customer logout proves POST-only export.

## Files / systems that may change

- `docs/ops/stage-plans/2026-09-21-stage-3-slice-6-logout-orders-journey.md` (this plan)  
- `docs/ops/evidence/2026-09-21-stage-3-slice-6-logout-orders-journey-acceptance.md` (+ JSON sibling if useful)  
- `.agent/HANDOVER.md`  
- `tests/customer-logout-orders-mount.test.mjs` (and/or sibling) — mounted logout + orders proofs  
- Optional: small offline UI proof module/test for `AccountOrders` projection parsing  
- Prefer no production code change unless a documented inert fixture seam or pure parser export is required  

External systems: **none** unless an unexpected read-only hosted probe is possible without secrets (not planned).

## Pre-mutation checks

| Check | Proof |
|-------|--------|
| On expected tip | `git rev-parse HEAD` = `d6a2d79e6e1af61fc71afe5c777ba82cbda5a322` before branch work |
| Gates off | `npm run check:live-boundaries` |
| Inventory gap | Confirm mount suite omits enabled logout/orders App Router outcomes; library/dispatcher coverage exists |
| Hosted feasibility | Confirm absence of Toby/preview secrets in agent env before claiming hosted PASS |

## Failure / stop / recovery

Stop on desire to arm Gen gates, place orders, email customers, enable hosted customer flags, use production project, or invent hosted PASS. Preserve evidence; record GAP. Recovery: leave gates false; no live window. Do not run destructive fixture resets (`tests/account-operations/setup.mjs`, `tests/staging-cart-account/setup.mjs`) against preserved data.

## Independent review point

Diff limited to logout/orders mount/UI offline proofs + docs/handover (+ optional narrow pure parser export). Reviewer confirms no live arming, no purchases, no paper hosted PASS.

## Execution

1. Commit stage plan first.  
2. Inventory PASS vs GAP honestly in evidence draft.  
3. TDD: mounted logout + orders through App Router route modules.  
4. Offline-safe orders UI proof.  
5. Document hosted journey PASS or GAP with exact blockers.  
6. `check:live-boundaries` + focused tests.  
7. Evidence + HANDOVER; push PR to `codex/tll-integration`.  

Max attempts: one coherent PR. No live launcher.

## Post-execution

- Evidence PASS/GAP table with file/test pointers  
- HANDOVER: Slice 6 status, tip SHA, whether Stage 3 is closed or what remains, next programme step  
