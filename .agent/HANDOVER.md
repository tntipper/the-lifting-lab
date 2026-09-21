# Agent handover — The Lifting Lab

Updated: 2026-09-21 (Stage 3 Slice 1+2)

## Stage status

- **Connection:** proven (Gen 19 `CREDENTIALS_VERIFIED_CONTROLS_DISABLED` on staging `qdmvngjwkcsilzmqksme`, window `51809dd4-bd4b-44c7-8609-7dd8ca063679`, then disarmed / `CREDENTIALS_VERIFIED_CONTROLS_DISABLED_NO_REPLAY`).
- **Integrated journey:** next (Stage 3 Slice 3+ — routes, Shopify callback, cart bind, logout/orders/browser).
- **Gen 19 tip SHA (integration after disarm PR #46):** `78e4bce8415936e82eaf4a88d2c06d26abcdcc13` on `codex/tll-integration`.
- **This workstream:** Stage 3 Slice 1 evidence + Slice 2 staging customer composition locks (see plan below).

## Authoritative pointers

| Item | Path / value |
|------|----------------|
| Stage plan | `docs/ops/stage-plans/2026-09-21-stage-3-slice-1-2.md` |
| Slice 1 evidence | `docs/ops/evidence/2026-09-21-stage-3-slice-1-five-purpose-acceptance.md` (+ `.json`) |
| Slice 2 acceptance | `docs/ops/evidence/2026-09-21-stage-3-slice-2-composition-acceptance.md` |
| Gen 19 verified | `docs/ops/stage-plans/2026-09-21-generation-19-credentials-verified.md` |
| Manifest status | `config/staging-account-activation-manifest.json` → `generation19Successor` |
| Gates | `config/project-stage-gate-policy.json` — `generation19Armed` / `ReplayPermitted` = false |
| Customer composition | `lib/server/staging-customer.ts` |
| Cart composition (separate) | `lib/commerce/staging-cart-server.ts` |
| Protocol | `docs/ops/project-stage-execution-protocol.md` |

## Hard stops

- No purchases; no production Supabase `wrhgscovsgsudtedbljr`; no customer email.
- Native Gen gates stay false; no Gen 20; no live / run-live-once / keychain arming.
- Gen 19 replay forbidden.

## Slice 1 one-liner

Connection provenance **PASS**; application five-purpose gateway journey **GAP** (next slices).
