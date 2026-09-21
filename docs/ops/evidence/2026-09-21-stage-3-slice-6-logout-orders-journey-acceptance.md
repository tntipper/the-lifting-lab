# Stage 3 Slice 6 — logout/orders + stop-before-purchase acceptance

Date: 2026-09-21  
Base: `codex/tll-integration` @ `d6a2d79e6e1af61fc71afe5c777ba82cbda5a322`  
Plan: `docs/ops/stage-plans/2026-09-21-stage-3-slice-6-logout-orders-journey.md`  
Tip under test: (see JSON `tipSha` after final commit)

## Investigation (library vs mount vs hosted)

| Existing proof | What it covers | What it does not cover |
|----------------|----------------|------------------------|
| `tests/customer-account-logout.test.mjs` | Local-first logout coordinator: Shopify end-session URL, held/uncertain, invalidation failure, config fail-closed | Not App Router mount |
| `tests/customer-account-logout-repository.test.mjs` + `tests/account-operations/logout-acceptance.test.mjs` | Durable revocation SQL (when fixture DB available) | Not mounted route; destructive setup excluded here |
| `tests/staging-customer-route.test.mjs` logout/orders cases | Dispatcher with injected `runtimeFactory` fourth-arg invalidate port; cookie expiry; held no provider redirect; route exports + fail-closed 409 | Does **not** use `TLL_CUSTOMER_AUTH_MOUNT_FIXTURE` through App Router modules for **enabled** logout/orders outcomes |
| `tests/customer-orders.test.mjs` / account-operations tests | Reader + coordinator bounded projection, no token leak | Unmounted |
| `app/account/orders/*` | Page + client UI already present | Client allowlist parser was inline/untested |
| Hosted preview / owned-email journey | Documented in `docs/ops/staging-account-activation.md` | Requires Toby/preview secrets, migrations 012–016, customer flag enablement — **absent in this agent** |

**Verdict:** Library/dispatcher coverage for logout/orders existed at tip `d6a2d79`. Slice 6 closes **App Router mount proof** for logout + orders and an offline-safe orders projection UI parser. Hosted stop-before-purchase remains **GAP**.

## Approach taken

- Mount suite `tests/customer-logout-orders-mount.test.mjs` loads `app/auth/customer/logout/route.ts` and `app/api/account/orders/route.ts` with the Slice 3–4 fixture seam.
- Extract `parseCustomerOrdersProjection` to `lib/identity/customer-orders-projection.ts` for offline UI allowlist proof; `AccountOrders` consumes it.
- No Gen arming, no hosted enablement, no purchases, no customer email.

## PASS / GAP

| Item | Result | Evidence |
|------|--------|----------|
| Mounted logout → Shopify end-session + expire all staging session cookies | **PASS** | `tests/customer-logout-orders-mount.test.mjs` — mounted logout with Shopify… |
| Mounted repeat logout (no upstream hint) → `/auth` + cookies cleared | **PASS** | same — mounted repeat logout… |
| Mounted held / SESSION_INVALIDATION_FAILED → `signout_failed`, cookies cleared, no provider redirect | **PASS** | same — held / SESSION_INVALIDATION_FAILED cases |
| Customer logout POST-only (GET 405 at App Router) | **PASS** | mount test POST-only export; legacy `GET /auth/signout` → 405 in `tests/integration/auth-routes.test.mjs` |
| Same-origin UX wiring (orders fetch credentials; logout form POST) | **PASS** | mount source assertions on `AccountOrders` / `page.tsx`; cookie `SameSite=Lax` |
| Mounted orders bounded projection + custody close; no access token in JSON | **PASS** | mount orders test |
| Orders UI allowlist parser offline | **PASS** | `tests/customer-orders-projection.test.mjs` |
| Cart checkout handoff without placing an order / no buyer access token in client | **PASS** | `tests/staging-cart.test.mjs` rejects `checkoutUrl` in Storefront query; buyerIdentity `countryCode` only; docs/commerce/staging-cart.md |
| Hosted browser stop-before-purchase (owned test email, stop before order) | **GAP** | No Toby credentials, no Vercel preview arming env, gates false, migrations 012–016 not installed on hosted staging per identity docs. Would invent a paper PASS to claim otherwise. |
| Temporary access retirement | **N/A** | No temporary hosted access opened |
| Exact source/deployment acceptance for hosted journey | **GAP** | Deferred to owner-run activation journey (`docs/ops/staging-account-activation.md` § journey) |
| `npm run check:live-boundaries` | **PASS** | `{"status":"PASS","violations":0}` |

## Hosted journey (attempt assessment)

| Step | Outcome |
|------|---------|
| Inspect agent env for preview / staging customer / Toby secrets | Absent |
| Attempt live/run-live-once / Gen arming | Refused (hard exclusion) |
| Controlled owned-email browser path | **Not run** — GAP |

## Commands run

```bash
npm run check:live-boundaries
node --test tests/customer-logout-orders-mount.test.mjs tests/customer-orders-projection.test.mjs
node --test tests/staging-customer-route.test.mjs tests/customer-account-logout.test.mjs tests/customer-orders.test.mjs
node --test tests/staging-cart.test.mjs
```

Did **not** run `tests/account-operations/setup.mjs` or `tests/staging-cart-account/setup.mjs` (avoids destructive fixture reset).

## Hard exclusions observed

No purchases, no Gen 20, no live/run-live-once/keychain arming, no production Supabase `wrhgscovsgsudtedbljr`, no production deploy, no customer marketing email, no paper hosted PASS.
