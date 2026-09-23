# Stage 3 — focused Supabase read-only probe arming gate

## Intended outcome

Run the committed focused probe once against staging `qdmvngjwkcsilzmqksme` to obtain the strict database receipt, Edge secret-name inventory and full custom-provider response. Its only permitted terminal success is `READONLY_PROVIDER_PRECONDITION_VERIFIED`, accompanied by a database receipt hash and a consumed `STOPPED_BEFORE_UPDATE` journal. The probe performs zero provider updates. This result would establish only Supabase preconditions for a later, separately authorized provider-normalization stage.

## Starting state and exclusions

Disabled source is committed at `f81960b` on `codex/tll-integration`. Focused checks passed 27/27; full disabled tests 2,362/2,362; typecheck, both manifests and live-boundary passed. Independent disabled-package review gave GO, hosted arming HOLD. The fresh 23 September staging baseline showed the provider enabled with a JWKS URI and no broker secret; a read-only CLI aggregate found 15 migrations, five retired runtime roles, zero enabled controls and zero sessions, but the CLI role `postgres` could not satisfy the strict `supabase_read_only_user` SQL identity. Supabase SQL editor UI access was denied. Those observations are not a substitute for the planned probe receipt.

Production `wrhgscovsgsudtedbljr`, Vercel, Shopify, customer communications, purchases, supplier orders, deployment, database writes and provider updates are excluded. Do not replay the consumed v4-v8 observer journals or use the provider-normalization mutation launcher. No credential window is currently open.

## Exact arming proposal, pending independent review

Only these source assignments may change, followed by regeneration of `config/staging-account-activation-manifest.json`:

```diff
--- a/scripts/staging-provider-readonly-live-launcher.mjs
+++ b/scripts/staging-provider-readonly-live-launcher.mjs
-export const STAGING_PROVIDER_READONLY_LIVE_ENABLED = false
+export const STAGING_PROVIDER_READONLY_LIVE_ENABLED = true
--- a/scripts/staging-provider-normalization-keychain.py
+++ b/scripts/staging-provider-normalization-keychain.py
-APPROVED_NATIVE_READ = False
+APPROVED_NATIVE_READ = True
```

The shared Keychain helper has other selector names. This launcher must invoke only its `supabase` selector; the separate provider-normalization launcher must remain false-gated. The helper's native approval should last only for this one-shot read and be reverted immediately. The generated manifest should change only source hashes; its `disabledMigrationInstall.nativeAccessApproved` must stay `false`. Review the exact generated diff before commit and direct invocation.

## Pre-run gates

1. Verify `pwd`, branch, HEAD, clean intended source diff and preservation of unrelated untracked files. Confirm all native gates are false and `npm run check:live-boundaries` passes before arming. Check both manifests and journal path `../implementation-state/staging/tll-provider-readonly-probe-v1.json` is absent. Never delete or reuse a consumed journal.
2. Capture a fresh, separately sourced read-only staging baseline: project identity, provider enabled/JWKS shape, Edge secret-name absence, and the limited database aggregates. Stop on drift, uncertain project identity or a broker secret now present.
3. Confirm the exact existing Supabase CLI Keychain item and its narrowly allowed reader without printing its value. Obtain explicit action-time approval for this credential read. If a prompt or ACL blocks access, stop; do not create a substitute token or broaden permissions without a new plan and approval.
4. Prepare the exact arming diff above, regenerate the activation manifest, and obtain independent review of the final file diff. Do not run the ordinary test suite while any flag is true. Commit the reviewed diff only if all pre-run checks pass.

## One allowed execution and stop conditions

Invoke `node scripts/staging-provider-readonly-live-launcher.mjs` directly once, with a hard bound from the phase journal. The launcher must create the distinct mode-0600 intent before the credential read, perform at most one SQL POST, one secret inventory, one API-key GET and one provider GET, and perform zero updates. It must wipe the credential Buffer and dispose the binding. Maximum attempts: one. An unexpected target, role, row count, secret name, provider shape, timeout, cleanup uncertainty or missing journal requires STOP and separate read-only reconciliation; never retry the consumed path.

## Post-run and handover

Immediately after the one invocation ends, whether success, failure or interruption, disarm both assignments and regenerate the activation manifest before any hosted reconciliation or prompt. If the process is interrupted, the first recovery action is disarm; never leave the shared Keychain helper armed while investigating. Then inspect only redacted fixed output and the journal phase/hash, and perform separate read-only reconciliation of provider, secret-name and database aggregates. Run disabled-focused checks, the full suite if source changed beyond the two flags, typecheck, both manifest checks, live-boundary and diff check. Commit the disarmed state and update `.agent/HANDOVER.md` with the exact result and remaining uncertainty. A later provider mutation requires its own fresh plan, review and approval.

## Closed outcome

The exact diff received independent GO and was armed at `391055b`. One direct invocation returned `READONLY_PROVIDER_PRECONDITION_VERIFIED` and the strict database receipt hash. The distinct mode-0600 journal is terminal `STOPPED_BEFORE_UPDATE`. Both flags were disarmed before separate UI/CLI reconciliation. Details and limits are recorded in `docs/ops/evidence/2026-09-23-stage3-provider-readonly-probe-result.md`. No mutation was attempted; the provider remains ENABLED and Stage 3 sign-in acceptance remains HOLD.
