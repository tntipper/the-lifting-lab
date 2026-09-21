# Agent handover — The Lifting Lab

Updated: 2026-09-21 (staging Customer Sign In entry → prepare/start)

## Stage status

- **Connection:** proven (Gen 19 `CREDENTIALS_VERIFIED_CONTROLS_DISABLED` on staging `qdmvngjwkcsilzmqksme`, window `51809dd4-bd4b-44c7-8609-7dd8ca063679`, then disarmed / `CREDENTIALS_VERIFIED_CONTROLS_DISABLED_NO_REPLAY`).
- **Slice 1+2:** landed on `codex/tll-integration` tip `3989c6c7e539caeece71841a18f90ee3bbd6382a` (PR #47).
- **Slice 3:** App Router prepare/start/authorize/recover mount proof landed (PR #48 merge tip `da3ae52cc6727e24828b1a9ad2d334d0dd868802`).
- **Slice 4:** Shopify callback + final application-session mount proof landed (PR #49 merge tip `7f670cbc1b7ba8fb4a0a95caf1be93e0d8c44d76`).
- **Slice 5:** Cart account bind + explicit guest→account transition mount proof landed (PR #50 merge tip `d6a2d79e6e1af61fc71afe5c777ba82cbda5a322`).
- **Slice 6:** Logout + orders App Router mount + offline orders UI projection proof landed. Honest **GAP:** hosted stop-before-purchase browser journey (needs Toby/preview secrets + activation; not run).
- **Staging Customer Account Client ID:** Headless Customer Account Confidential Client `c8f7b926-9073-416c-9949-0d99e89a99c0` (Dev Dashboard app key is not this client). Shop `107532616020` / issuer / reviewed preview origin unchanged. OAuth scopes remain `openid email customer-account-api:full`. Vercel client secret and proof stamp / config hash re-approval remain operator steps.
- **Sign In entry (this change):** When `NEXT_PUBLIC_TLL_ENVIRONMENT === 'staging'` and `NEXT_PUBLIC_TLL_STAGING_CUSTOMER === 'enabled'`, TopNav Sign In (and equivalent CTAs) target `/auth/customer`, which POSTs prepare → start per the browser-delivery CSRF/cookie contract; `/auth` also fails closed into that entry (no Google/magic-link). Flags off → ordinary `/auth` unchanged. **GAP:** hosted re-walk + storefront token still operator.
- **Stage 3 closed?** Offline wiring checklist slices 1–6 mount/composition **PASS**. Stage 3 is **not** fully closed until the hosted stop-before-purchase journey is owner-run and recorded (or explicitly waived under new programme authority).
- **Next programme step:** Owner-controlled hosted activation journey per `docs/ops/staging-account-activation.md` (owned test email; cart choice without checkout; `/account/orders`; unified logout; **stop before purchase**), including re-walk of Sign In → Shopify. Do not arm Gen 20 / live launchers from ordinary agents.

## Authoritative pointers

| Item | Path / value |
|------|----------------|
| Sign In entry evidence | `docs/ops/evidence/2026-09-21-staging-customer-sign-in-entry-acceptance.md` |
| Sign In UI helpers | `lib/identity/staging-customer-ui.ts`, `lib/identity/staging-customer-sign-in.ts` |
| Sign In entry UI | `components/StagingCustomerSignInEntry.tsx`, `app/auth/customer/page.tsx` |
| Slice 6 stage plan | `docs/ops/stage-plans/2026-09-21-stage-3-slice-6-logout-orders-journey.md` |
| Slice 6 evidence | `docs/ops/evidence/2026-09-21-stage-3-slice-6-logout-orders-journey-acceptance.md` (+ `.json`) |
| Customer route mount | `lib/server/staging-customer-route.ts` + `app/auth/customer/{prepare,start,authorize,shopify/callback,callback,recover,logout}/route.ts` |
| Protocol | `docs/ops/project-stage-execution-protocol.md` |

## Hard stops

- No purchases; no production Supabase `wrhgscovsgsudtedbljr`; no customer email as identity.
- Native Gen gates stay false; no Gen 20; no live / run-live-once / keychain arming.
- Gen 19 replay forbidden.

## Sign In entry one-liner

Preview staging-customer flags on → Sign In starts prepare/start (not Google `/auth`); flags off → `/auth` unchanged; hosted Shopify re-walk **GAP**.
