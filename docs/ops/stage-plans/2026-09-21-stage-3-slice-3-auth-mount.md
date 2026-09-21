# Stage 3 — Slice 3: mount prepare/start/authorize/recover

Date: 2026-09-21  
Base tip: `3989c6c7e539caeece71841a18f90ee3bbd6382a` (`codex/tll-integration`, after PR #47)  
Protocol: `docs/ops/project-stage-execution-protocol.md`  
Programme: Stage 3 wiring checklist — Slice 3 only

## Intended outcome

Mount proof for the App Router boundaries `POST/GET /auth/customer/{prepare,start,authorize,recover}`: exercise the **actual route modules** that Next registers, with a secret-free fixture runtime, and record measurable PASS/GAP for real Set-Cookie / CSRF / duplicate start / cancelled request / lost acknowledgement / replay / expiry. Do not claim Slice 4–6.

## Measurable acceptance

| Criterion | Proof |
|-----------|--------|
| Stage plan written before mutation | This file committed on the Slice 3 branch |
| prepare/start/authorize/recover App Router modules are the dispatch surface under test | Tests import/bundle `app/auth/customer/{prepare,start,authorize,recover}/route.ts` and call exported `POST`/`GET` |
| Real cookie headers on prepare | Mounted prepare response includes `__Host-tll-customer-start` Set-Cookie (HttpOnly/Secure/SameSite/Path) |
| CSRF on start | Wrong/missing CSRF through mounted start → held; no replacement authority cookie |
| Duplicate start | Active transaction cookie through mounted start → held |
| Cancelled request | Aborted/slow body through mounted prepare → held; body cancelled |
| Lost acknowledgement | Mounted start path that loses post-register acknowledgement → held + quarantine side-effect asserted (or GAP) |
| Replay | Mounted authorize/recover replay of consumed capability → held (or GAP) |
| Expiry | Past start window through mounted prepare/start → held; binding not refreshed |
| Fail-closed without staging config | Next HTTP smoke: four routes return held `409` with native gates off |
| `npm run check:live-boundaries` PASS; focused mount tests PASS | Commands in evidence |
| Evidence + `.agent/HANDOVER.md` updated | Secret-free PASS/GAP table |

## Explicit exclusions

- Slice 4 Shopify callback / final session claims beyond what already exists  
- Slice 5 cart bind / guest→account  
- Slice 6 logout/orders hosted browser journey / purchases  
- Gen 20; live / run-live-once / keychain arming; native gates stay false  
- Production Supabase `wrhgscovsgsudtedbljr`  
- Customer email; purchases; production deploy  
- Paper PASS — unclosed items recorded as GAP with pointers  

## Authoritative starting state

- Branch tip: `3989c6c7e539caeece71841a18f90ee3bbd6382a` on `codex/tll-integration`  
- Thin wrappers already present under `app/auth/customer/{prepare,start,authorize,recover}/route.ts` → `stagingCustomerRoute`  
- Composition: `lib/server/staging-customer.ts`; delivery: `lib/identity/customer-admission-browser-delivery.ts`  
- Existing unit/dispatch: `tests/staging-customer-route.test.mjs`; delivery offline: `tests/customer-admission-browser-delivery.test.mjs`  
- Hypothesis to verify: those suites do **not** alone prove mounted App Router responses with Set-Cookie/CSRF/replay through the route modules  

## Assumptions requiring evidence

1. Delivery unit tests ≠ mount proof (verify by inventory before writing PASS).  
2. Local Next HTTP cannot use the delivery origin allowlist (`https://the-lifting-…-my-lifting-lab-s-projects.vercel.app`) without DNS/TLS overrides; therefore primary mount proof invokes the **App Router route exports** Next registers, with Request URLs on the allowlisted origin, plus a separate Next smoke for fail-closed mount presence.  
3. Lost-ack / authorize replay happy-paths that need durable SQL may remain GAP unless a secret-free fixture can close them honestly.

## Files / systems that may change

- `docs/ops/stage-plans/2026-09-21-stage-3-slice-3-auth-mount.md` (this plan)  
- `docs/ops/evidence/2026-09-21-stage-3-slice-3-auth-mount-acceptance.md` (+ JSON sibling if useful)  
- `.agent/HANDOVER.md`  
- `lib/server/staging-customer-route.ts` (narrow mount-fixture resolve only)  
- `tests/customer-auth-mount.test.mjs` (and small helper under `tests/helpers/` if needed)  
- Optional `tests/integration/customer-auth-mount-routes.test.mjs` for Next smoke  

External systems: **none**.

## Pre-mutation checks

| Check | Proof |
|-------|--------|
| On expected tip | `git rev-parse HEAD` = `3989c6c…` before branch work |
| Gates off | `npm run check:live-boundaries` |
| Inventory gap | Confirm `tests/staging-customer-route.test.mjs` mocks delivery; no Next/App-route mount assertion for cookie/CSRF suite |

## Failure / stop / recovery

Stop on desire to arm Gen gates, touch Shopify callback session claims, cart bind, logout/orders browser journey, production project, or customer email. Preserve evidence; record GAP rather than paper PASS. Recovery: leave gates false; no live window.

## Independent review point

Diff limited to fixture seam + mount tests + docs/handover. Reviewer confirms no live arming and no Slice 4–6 scope.

## Execution

1. Commit stage plan.  
2. TDD: failing mount tests → fixture seam → green.  
3. Next smoke for fail-closed held (if practical).  
4. `check:live-boundaries` + focused tests.  
5. Evidence + HANDOVER; push PR to `codex/tll-integration`.  

Max attempts: one coherent PR. No live launcher.

## Post-execution

- Evidence PASS/GAP table with file/test pointers  
- HANDOVER: Slice 3 status, tip SHA, next = Slice 4 Shopify callback/session  
