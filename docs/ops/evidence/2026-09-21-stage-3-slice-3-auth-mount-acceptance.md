# Stage 3 Slice 3 — auth mount acceptance

Date: 2026-09-21  
Tip under test: see git tip of this PR branch  
Base: `codex/tll-integration` @ `3989c6c7e539caeece71841a18f90ee3bbd6382a`  
Plan: `docs/ops/stage-plans/2026-09-21-stage-3-slice-3-auth-mount.md`

## Investigation (mount gap)

| Existing proof | What it covers | What it does not cover |
|----------------|----------------|------------------------|
| `tests/staging-customer-route.test.mjs` | Dispatch, cookie reader, held fail-closed, route files export methods | No real delivery Set-Cookie/CSRF/expiry through App Router handlers |
| `tests/customer-admission-browser-delivery.test.mjs` | Offline delivery CSRF/cookies/expiry/cancel | Does not call `app/auth/customer/*/route.ts` |
| `tests/integration/auth-routes.test.mjs` | Next preserves Set-Cookie on Web Responses | Supabase auth callback/sign-out only — not customer admission routes |

**Verdict:** unit/dispatch + unmounted delivery tests are necessary but not sufficient for Slice 3 mount acceptance. Slice 3 adds App Router handler mount proof.

## Approach taken

- Primary proof: bundle and invoke the exact App Router modules Next registers (`prepare`/`start`/`authorize`/`recover`), with Request URLs on the delivery origin allowlist.
- Narrow test-only seam: `STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY` + `TLL_CUSTOMER_AUTH_MOUNT_FIXTURE=1` in `lib/server/staging-customer-route.ts` (inert unless both are set).
- Local Next HTTP cannot satisfy the delivery origin allowlist without DNS/TLS overrides; that is recorded as GAP, not papered over. Next Set-Cookie preservation for Web Responses remains covered by `tests/integration/auth-routes.test.mjs`.

## PASS / GAP

| Item | Result | Evidence |
|------|--------|----------|
| Mounted prepare Set-Cookie (`__Host-tll-customer-start`, HttpOnly/Secure/SameSite/Path) + CSRF | **PASS** | `tests/customer-auth-mount.test.mjs` — real delivery through App Router `POST` |
| Mounted start CSRF denial | **PASS** | same — real delivery |
| Mounted duplicate start (transaction cookie present) | **PASS** | same — real delivery |
| Mounted cancelled / stalled prepare body | **PASS** | same — real delivery; body cancelled; no Set-Cookie |
| Mounted prepare/start expiry (no binding refresh) | **PASS** | same — real delivery |
| Mounted lost-acknowledgement response surface (held + expire TX cookie) | **PASS (contract)** | same — scripted delivery through mounted `start`; durable SQL lost-ack remains in admission-bridge suites |
| Mounted authorize/recover replay denial surface | **PASS (contract)** | same — scripted delivery through mounted `authorize`/`recover`; durable one-use admit remains in delivery/admission-bridge suites |
| Fixture seam inert without env | **PASS** | same |
| Fail-closed without staging config (route modules) | **PASS** | existing `tests/staging-customer-route.test.mjs` route-file assertions |
| Local Next HTTP cookie drive-through on allowlisted origin | **GAP** | Origin allowlist is `https://the-lifting-…-my-lifting-lab-s-projects.vercel.app`; no DNS/TLS override in this slice |
| Full start→admit→recover with durable SQL through mount | **GAP** | Out of offline fixture; admission-bridge PG suites retain durable proof |
| Slice 4 Shopify callback / final session | **GAP** | Explicitly excluded |
| `npm run check:live-boundaries` | **PASS** | `{"status":"PASS","violations":0}` |

## Commands run

```bash
npm run check:live-boundaries
node --experimental-strip-types --test \
  tests/customer-auth-mount.test.mjs \
  tests/staging-customer-route.test.mjs \
  tests/customer-admission-browser-delivery.test.mjs
```

## Hard exclusions observed

No Gen 20, no live/run-live-once/keychain arming, no production Supabase `wrhgscovsgsudtedbljr`, no customer email, no purchases, no production deploy, no Slice 4–6 scope expansion.
