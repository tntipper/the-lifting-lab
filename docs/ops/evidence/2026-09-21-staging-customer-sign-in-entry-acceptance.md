# Staging Customer Sign In entry — acceptance

Date: 2026-09-21  
Base: `codex/tll-integration`  
Scope: Preview-only Sign In → Customer Account prepare/start (no production; no secrets)

## Problem

Hosted walk found TopNav **SIGN IN** → `/auth` (ordinary Google/magic-link). Google failed “provider is not enabled”. Staging customer App Router mounts existed with no UI that starts prepare → start.

## Approach

- Public helpers `stagingCustomerUiEnabled` / `accountSignInHref` (flags only; no server arming).
- Browser helper `startStagingCustomerSignIn` fetches `/auth/customer/prepare`, then returns a fixed same-origin form contract. The component performs a document POST to `/auth/customer/start`, allowing the browser to follow the server's `303` without trying to inspect an opaque manual-redirect response.
- `/auth/customer` intentionally auto-starts the entry. `/auth` renders a passive signed-out state with an explicit Shopify sign-in button, so Shopify logout cannot immediately reopen login.
- TopNav and equivalent Sign In CTAs use `accountSignInHref()`.

## PASS / GAP

| Item | Result | Evidence |
|------|--------|----------|
| Staging-enabled Sign In href → `/auth/customer` | **PASS** | `tests/staging-customer-sign-in-ui.test.mjs` |
| Staging-disabled Sign In href → `/auth` | **PASS** | same |
| prepare fetch → validated fixed-action start form contract | **PASS** | same |
| start uses document form navigation, not manual fetch redirect | **PASS** | same (source contract); hosted browser re-walk remains below |
| prepare failure stays held (no Google) | **PASS** | same |
| `/auth` is passive after logout; `/auth/customer` is intentional auto-start | **PASS** | same (source + helper) |
| TopNav / auth page / entry wiring | **PASS** | same (source + helper) |
| `npm run check:live-boundaries` | **PASS** | `{"status":"PASS","violations":0}` |
| Hosted Preview re-walk (Sign In → Shopify) | **GAP** | Operator; needs preview + staging customer runtime |
| Storefront cart token / purchase path | **GAP** | Explicitly out of scope |

## Hard exclusions observed

No production auth change, no secrets in git, no env flag flips in code, no Gen arming, no purchases.
