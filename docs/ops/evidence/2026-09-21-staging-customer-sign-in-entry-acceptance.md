# Staging Customer Sign In entry — acceptance

Date: 2026-09-21  
Base: `codex/tll-integration`  
Scope: Preview-only Sign In → Customer Account prepare/start (no production; no secrets)

## Problem

Hosted walk found TopNav **SIGN IN** → `/auth` (ordinary Google/magic-link). Google failed “provider is not enabled”. Staging customer App Router mounts existed with no UI that starts prepare → start.

## Approach

- Public helpers `stagingCustomerUiEnabled` / `accountSignInHref` (flags only; no server arming).
- Browser helper `startStagingCustomerSignIn` POSTs `/auth/customer/prepare` then `/auth/customer/start` with the existing form CSRF/cookie contract; navigates only to same-origin `/auth/customer/authorize`; fail-closed held message (no Google fallback).
- `/auth/customer` page + `StagingCustomerSignInEntry`; `/auth` also renders that entry when staging customer public flags are on (covers Shopify logout return to `/auth`).
- TopNav and equivalent Sign In CTAs use `accountSignInHref()`.

## PASS / GAP

| Item | Result | Evidence |
|------|--------|----------|
| Staging-enabled Sign In href → `/auth/customer` | **PASS** | `tests/staging-customer-sign-in-ui.test.mjs` |
| Staging-disabled Sign In href → `/auth` | **PASS** | same |
| prepare → start posts + authorize Location | **PASS** | same |
| Held / non-authorize Location stays held (no Google) | **PASS** | same |
| TopNav / auth page / entry wiring | **PASS** | same (source + helper) |
| `npm run check:live-boundaries` | **PASS** | `{"status":"PASS","violations":0}` |
| Hosted Preview re-walk (Sign In → Shopify) | **GAP** | Operator; needs preview + staging customer runtime |
| Storefront cart token / purchase path | **GAP** | Explicitly out of scope |

## Hard exclusions observed

No production auth change, no secrets in git, no env flag flips in code, no Gen arming, no purchases.
