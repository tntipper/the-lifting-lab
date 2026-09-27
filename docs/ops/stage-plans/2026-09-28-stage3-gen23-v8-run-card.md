# Generation 23 v8: one supervised protected-staging run card

This is a successor to the [v7 run and recovery](../evidence/2026-09-27-gen23-v7-run-and-recovery.md). It is **not permission to execute**. The owner must be at the Mac for visible Shopify sign-in. No production change, purchase, customer campaign or push of the local arming commit is permitted. The [complete-window plan](2026-09-28-stage3-gen23-v8-complete-window.md) is part of this card.

## Fixed identity and unused-record gate

- Staging Supabase project: `qdmvngjwkcsilzmqksme`; production project `wrhgscovsgsudtedbljr` is excluded. Protected Vercel Preview branch: `codex/tll-integration` in `the-lifting-lab`.
- New broker/window identifier: `f910c5cb-1a94-410a-8e8d-2c9704c1536a`. The disabled `tll-broker-readiness` Edge source must be redeployed to staging with this ID before the v8 run. A held authenticated GET must return 404 while its temporary window setting is absent.
- The launcher must verify the **three** preserved v7 one-use files and exact SHA-256 values: whole-route HOLD `2f7a328c610d0fc5e9b84f2ef6dd61003790baf39ca47f8de72889dcc28e7deb`, database retirement `74b4f19ad2dd4a0fcff49280fe7b4dc5cfe43cacac7cdc4e1db75fe659bac56c`, broker-gate retirement `243c953ea5ff5ad14d3ff31976e1dfb7ff580326c4d7ebf91ab024048182912c`. Preserve them; never replay them.
- All **20** v8 one-use paths listed in `GENERATION_23_LAUNCH_RECORD_NAMES` in `scripts/staging-generation-23-live-launcher.mjs` must be absent. This includes `tll-generation-23-consumer-diagnostic-v8.json`. An existing or uncertain record closes the new window.

## Required sequence

1. Verify branch, exact disabled commit, clean tracked tree, remote predecessor, generated manifests, focused/full tests, typecheck, lint and live-boundary check. Complete the real assembled consumer joined test. Obtain independent review of this exact disabled source and publication action.
2. With separate action-time approval, publish only the reviewed disabled commit to the protected staging branch and deploy only the changed disabled broker readiness Edge function to staging. Verify the new build's source, protection and all four account/cart controls OFF. No other deploy is implied.
3. Read the actual staging starting state: five database roles NOLOGIN/passwordless, zero sessions, all five controls OFF, custom provider disabled, temporary broker-window secret name absent, authenticated broker response held, Preview flags OFF and exact published source. Confirm saved credentials can be read privately. Any mismatch stops before arming.
4. Review the exact local-only arming patch of **68 policy-listed gates** and one fresh one-hour expiry with at least 45 minutes remaining. Confirm all 20 v8 records still absent and the three prior hashes unchanged. Obtain independent review and separate action-time owner approval of that exact one-run patch. Do not push it.
5. Invoke the fixed parent launcher once. It performs the same complete sequence specified in the v7 card: temporary settings and role setup, classified connection checks, new held Preview, actual website and broker consumer checks, temporary customer activation, owner sign-in/orders/cart/checkout GET/logout, then database/provider/site OFF, passwordless role retirement, broker-window removal and final readback. Its new diagnostic records the precise consumer substep and numeric HTTP statuses only.
6. If PASS, independently prove OFF/passwordless/zero sessions, broker held and final held Preview. If HOLD, do not retry; inspect the one-use diagnostic and journals, take a fresh read-only inventory, then separately review any needed cleanup. Revert the local arming commit and preserve all records in either case.

The Mac lacks a route to the direct Supabase IPv6 database address. The accepted connection proof is the reviewed verifier-plus-pooler substitute together with actual website and broker reads; it is weaker than a direct independent login. The v7 consumer stop's root cause is unproved, so v8's diagnostic is a way to distinguish a repeat, not evidence of a repair.
