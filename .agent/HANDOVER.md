# Agent handover — The Lifting Lab

Updated: 2026-09-21 (Stage 3 Slice 5)

## Stage status

- **Connection:** proven (Gen 19 `CREDENTIALS_VERIFIED_CONTROLS_DISABLED` on staging `qdmvngjwkcsilzmqksme`, window `51809dd4-bd4b-44c7-8609-7dd8ca063679`, then disarmed / `CREDENTIALS_VERIFIED_CONTROLS_DISABLED_NO_REPLAY`).
- **Slice 1+2:** landed on `codex/tll-integration` tip `3989c6c7e539caeece71841a18f90ee3bbd6382a` (PR #47).
- **Slice 3:** App Router prepare/start/authorize/recover mount proof landed (PR #48 merge tip `da3ae52cc6727e24828b1a9ad2d334d0dd868802`).
- **Slice 4:** Shopify callback + final application-session mount proof landed (PR #49 merge tip `7f670cbc1b7ba8fb4a0a95caf1be93e0d8c44d76`).
- **Slice 5:** Cart account bind + explicit guest→account transition mount proof landed (see plan/evidence below). Honest GAPs: browser history.back; hosted preview cart with real Supabase + migration 014; durable SQL transition through App Router mounts.
- **Next:** Stage 3 Slice 6 — logout/orders + hosted browser stop-before-purchase.
- **This tip:** branch `cursor/stage3-slice5-cart-account-bind-f326` (see PR head SHA in report).

## Authoritative pointers

| Item | Path / value |
|------|----------------|
| Slice 5 stage plan | `docs/ops/stage-plans/2026-09-21-stage-3-slice-5-cart-account-bind.md` |
| Slice 5 evidence | `docs/ops/evidence/2026-09-21-stage-3-slice-5-cart-account-bind-acceptance.md` (+ `.json`) |
| Slice 4 stage plan | `docs/ops/stage-plans/2026-09-21-stage-3-slice-4-shopify-callback-session.md` |
| Slice 4 evidence | `docs/ops/evidence/2026-09-21-stage-3-slice-4-shopify-callback-session-acceptance.md` (+ `.json`) |
| Slice 3 stage plan | `docs/ops/stage-plans/2026-09-21-stage-3-slice-3-auth-mount.md` |
| Slice 3 evidence | `docs/ops/evidence/2026-09-21-stage-3-slice-3-auth-mount-acceptance.md` (+ `.json`) |
| Slice 1+2 plan | `docs/ops/stage-plans/2026-09-21-stage-3-slice-1-2.md` |
| Gen 19 verified | `docs/ops/stage-plans/2026-09-21-generation-19-credentials-verified.md` |
| Manifest status | `config/staging-account-activation-manifest.json` → `generation19Successor` |
| Gates | `config/project-stage-gate-policy.json` — `generation19Armed` / `ReplayPermitted` = false |
| Customer composition | `lib/server/staging-customer.ts` |
| Customer route mount | `lib/server/staging-customer-route.ts` + `app/auth/customer/{prepare,start,authorize,shopify/callback,callback,recover}/route.ts` |
| Cart composition | `lib/commerce/staging-cart-server.ts` + `app/api/cart/route.ts` |
| Cart account transition | `lib/commerce/staging-cart-http.ts` + `lib/commerce/staging-cart-transition.ts` |
| Protocol | `docs/ops/project-stage-execution-protocol.md` |

## Hard stops

- No purchases; no production Supabase `wrhgscovsgsudtedbljr`; no customer email as identity.
- Native Gen gates stay false; no Gen 20; no live / run-live-once / keychain arming.
- Gen 19 replay forbidden.

## Slice 5 one-liner

App Router `/api/cart` account bind + explicit guest→account transition **PASS** (mounted verified UUID session, `transition_required`, transfer/use_account); history.back, hosted preview+014, and SQL-through-mount remain **GAP**.
