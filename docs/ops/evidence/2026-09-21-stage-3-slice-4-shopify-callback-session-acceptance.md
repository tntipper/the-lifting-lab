# Stage 3 Slice 4 — Shopify callback + final session acceptance

Date: 2026-09-21  
Base: `codex/tll-integration` @ `da3ae52cc6727e24828b1a9ad2d334d0dd868802`  
Plan: `docs/ops/stage-plans/2026-09-21-stage-3-slice-4-shopify-callback-session.md`  
Tip under test: `3ea97c91b424a7832aa2bef200d6e7639920cbd6`

## Investigation (library vs mount)

| Existing proof | What it covers | What it does not cover |
|----------------|----------------|------------------------|
| `tests/staging-customer-route.test.mjs` | Dispatch for `shopify-callback` + final `callback`; session write/hold; route files export GET | Does not invoke App Router modules as Next-registered mounts with allowlist Request URLs |
| `lib/identity/customer-admission-browser-delivery.ts` + delivery/admission-bridge tests | Unmounted Shopify callback, origin/path checks, sealed ready redirect | Not App Router `shopify/callback/route.ts` |
| `lib/server/staging-customer-session.ts` + route unit tests | Tokens-only SSR release after reconciliation | Not through `app/auth/customer/callback/route.ts` mount |
| `tests/customer-subject-broker.test.mjs` / final-exchange / final-reconciliation | Sign-in vs migration evidence; identity by provider subject | Email non-merge was structural; lacked a named shared-email distinct-subjects test until this slice |
| `tests/customer-auth-mount.test.mjs` (Slice 3) | prepare/start/authorize/recover mounts | Omits Shopify + final callback routes |

**Verdict:** Thin wrappers and library/dispatch coverage existed at tip `da3ae52`. Slice 4 closes **App Router mount proof** for the two callback boundaries, rechecks allowlists at that surface, names shared-email non-merge, and records honest GAPs.

## Approach taken

- Primary proof: bundle and invoke `app/auth/customer/shopify/callback/route.ts` and `app/auth/customer/callback/route.ts` GET exports (Slice 3 fixture seam: `STAGING_CUSTOMER_ROUTE_RUNTIME_FACTORY` + `TLL_CUSTOMER_AUTH_MOUNT_FIXTURE=1`).
- Allowlist denials: real offline delivery for Shopify origin/path/navigate; scripted `finalBinding` for final callback origin/query.
- Session release: scripted `finalReconciliation.complete` → `stagingCustomerSessionResponse` through mounted final GET.
- Shared email: named broker test — two Shopify subjects with identical email metadata → two opaque `sub` values; subject keys never include email.
- Sign-in vs migration evidence: library suites remain authoritative; mount proves rejected reconciliation never releases SSR cookies.

## PASS / GAP

| Item | Result | Evidence |
|------|--------|----------|
| Mounted Shopify callback allowlisted broker Location + TX Set-Cookie | **PASS** | `tests/customer-auth-callback-mount.test.mjs` |
| Mounted Shopify callback origin/path/navigate allowlist denials | **PASS** | same — real delivery before ports |
| Mounted final callback tokens-only SSR session + expire TX/BOOT + `/dashboard` | **PASS** | same |
| Mounted final callback failed persistence → hold + 409 + no session cookie | **PASS** | same |
| Mounted final callback non-allowlisted origin/query → held; no complete | **PASS** | same |
| Mounted missing reconciliation evidence → no session release | **PASS (contract)** | same; durable mode selection remains in final-reconciliation / broker suites |
| Two distinct Shopify subjects cannot merge by shared email | **PASS** | `tests/customer-subject-broker.test.mjs` — named test |
| Sign-in vs migration require respective evidence | **PASS** | broker: migration needs session/target; sign-in forbids migrationProof / skips session; final exchange mode-specific ports (`tests/customer-subject-broker.test.mjs`, `tests/customer-final-reconciliation.test.mjs`, `tests/supabase-final-exchange.test.mjs`) |
| Fixture seam inert without env | **PASS** | callback mount suite |
| Fail-closed without staging config (route modules) | **PASS** | existing `tests/staging-customer-route.test.mjs` route-file loop includes both callbacks |
| Local Next HTTP cookie drive-through on allowlisted origin | **GAP** | Same as Slice 3 — Vercel preview origin allowlist; no DNS/TLS override in this slice |
| Full admit→Shopify→broker→final with durable SQL through App Router mounts | **GAP** | Out of offline fixture; `tests/admission-bridge/browser-delivery.test.mjs` + PG suites retain durable journey |
| Slice 5 cart bind / guest→account | **GAP** | Explicitly excluded |
| `npm run check:live-boundaries` | **PASS** | `{"status":"PASS","violations":0}` |

## Commands run

```bash
npm run check:live-boundaries
node --experimental-strip-types --test \
  tests/customer-auth-callback-mount.test.mjs \
  tests/customer-subject-broker.test.mjs \
  tests/staging-customer-route.test.mjs
```

## Hard exclusions observed

No Gen 20, no live/run-live-once/keychain arming, no production Supabase `wrhgscovsgsudtedbljr`, no customer email as identity, no purchases, no production deploy, no Slice 5–6 scope expansion.
