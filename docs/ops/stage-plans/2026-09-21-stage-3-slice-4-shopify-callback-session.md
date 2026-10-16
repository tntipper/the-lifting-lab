# Stage 3 — Slice 4: Shopify callback + final application-session release

Date: 2026-09-21  
Base tip: `da3ae52cc6727e24828b1a9ad2d334d0dd868802` (`codex/tll-integration`, after PR #48)  
Protocol: `docs/ops/project-stage-execution-protocol.md`  
Programme: Stage 3 wiring checklist — Slice 4 only

## Intended outcome

Close Slice 4 acceptance for the inner Shopify authorization/callback path and the final application-session release: prove (or honestly GAP) that App Router mounts for `shopify-callback` and final `callback` enforce redirect allowlists, that two different provider subjects cannot merge by shared email alone, and that sign-in vs migration each require their own evidence. Do not claim Slice 5–6.

## Measurable acceptance

| Criterion | Proof |
|-----------|--------|
| Stage plan written before mutation | This file committed on the Slice 4 branch before implementation |
| Investigation: library vs mount GAP recorded honestly | Evidence inventory table — no paper PASS for unmounted-only coverage |
| Shopify callback App Router module is the surface under test | Tests bundle/import `app/auth/customer/shopify/callback/route.ts` and call exported `GET` |
| Final callback App Router module is the surface under test | Tests bundle/import `app/auth/customer/callback/route.ts` and call exported `GET` |
| Callback redirect allowlists enforced | Mounted denials for wrong origin/path/query; happy-path Location only on allowlisted targets |
| Two provider subjects cannot merge by shared email | Named test (or cited structural + conflict proofs) showing distinct subjects stay distinct despite identical email metadata |
| Sign-in vs migration require respective evidence | Mounted or library-cited proofs: migration needs live session/target proof; sign-in forbids migration proof path; final exchange uses mode-specific ports |
| Final session release through mount | Mounted final callback → tokens-only SSR Set-Cookie + 303 `/dashboard`; failed persistence → hold + 409 + no session cookie |
| Fixture seam inert unless explicit test env | `TLL_CUSTOMER_AUTH_MOUNT_FIXTURE=1` required (reuse Slice 3 seam) |
| `npm run check:live-boundaries` PASS; focused tests PASS | Commands in evidence |
| Evidence + `.agent/HANDOVER.md` updated | Secret-free PASS/GAP table; next = Slice 5 cart bind / guest→account |

## Explicit exclusions

- Slice 5 cart bind / guest→account  
- Slice 6 hosted browser purchase-adjacent journey / logout-orders UI beyond Slice 4 needs  
- Gen 20; live / run-live-once / keychain arming; native gates stay false  
- Production Supabase `wrhgscovsgsudtedbljr`  
- Customer email as identity; purchases; production deploy  
- Paper PASS — unclosed items recorded as GAP with pointers  

## Authoritative starting state

- Branch tip: `da3ae52cc6727e24828b1a9ad2d334d0dd868802` on `codex/tll-integration`  
- Thin wrappers already present: `app/auth/customer/shopify/callback/route.ts` → `shopify-callback`; `app/auth/customer/callback/route.ts` → `callback`  
- Composition + dispatch already include `shopifyProof` / `finalReconciliation` in `lib/server/staging-customer.ts` and `lib/server/staging-customer-route.ts`  
- Slice 3 mount pattern: `tests/customer-auth-mount.test.mjs` + `STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY`  
- Hypothesis to verify: library/dispatch suites do **not** alone prove mounted App Router behaviour for Shopify callback allowlists and final session cookie release  

## Assumptions requiring evidence

1. Dispatch tests in `tests/staging-customer-route.test.mjs` prove action wiring, not App Router mount cookie/allowlist behaviour for the two callback routes.  
2. Local Next HTTP cannot use the delivery/final allowlisted Vercel origins without DNS/TLS overrides; primary proof invokes App Router route exports with Request URLs on allowlisted origins (same as Slice 3).  
3. Durable SQL start→Shopify→final through mount may remain GAP; admission-bridge / PG suites retain that layer.  
4. Email never enters broker finish identity — a named “shared email, distinct subjects” assertion may use unused metadata or fixture email fields that must not affect `sub` / subject rows.

## Files / systems that may change

- `docs/ops/stage-plans/2026-09-21-stage-3-slice-4-shopify-callback-session.md` (this plan)  
- `docs/ops/evidence/2026-09-21-stage-3-slice-4-shopify-callback-session-acceptance.md` (+ JSON sibling if useful)  
- `.agent/HANDOVER.md`  
- `tests/customer-auth-callback-mount.test.mjs` (and/or narrow extension of mount helpers)  
- Optional narrow test in subject-broker / final-exchange suite for shared-email non-merge naming  
- `lib/server/staging-customer-route.ts` only if mount fixture for `finalReconciliation` needs a documented adjustment (prefer reuse of existing seam)

External systems: **none**.

## Pre-mutation checks

| Check | Proof |
|-------|--------|
| On expected tip | `git rev-parse HEAD` = `da3ae52cc6727e24828b1a9ad2d334d0dd868802` before branch work |
| Gates off | `npm run check:live-boundaries` |
| Inventory gap | Confirm Slice 3 mount suite omits shopify/callback + callback; library coverage exists but is unmounted |

## Failure / stop / recovery

Stop on desire to arm Gen gates, cart bind, logout/orders browser journey, production project, or treat customer email as identity. Preserve evidence; record GAP rather than paper PASS. Recovery: leave gates false; no live window.

## Independent review point

Diff limited to mount/evidence tests + docs/handover (+ optional named non-merge test). Reviewer confirms no live arming and no Slice 5–6 scope.

## Execution

1. Commit stage plan first.  
2. Inventory PASS vs GAP honestly in evidence draft.  
3. TDD: mount tests for shopify-callback + final callback (allowlists, session release, seam inert).  
4. Named shared-email non-merge proof if structural coverage is insufficiently named.  
5. `check:live-boundaries` + focused tests.  
6. Evidence + HANDOVER; push PR to `codex/tll-integration`.  

Max attempts: one coherent PR. No live launcher.

## Post-execution

- Evidence PASS/GAP table with file/test pointers  
- HANDOVER: Slice 4 status, tip SHA, next = Slice 5 cart bind / guest→account  
