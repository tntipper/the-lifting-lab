# Diagnose v7's generic validation failure while disabled

## Outcome and boundary

Identify the exact local path that produced v7's terminal
`observation_validation_unavailable` despite successful serial read-only
reconciliation. Add a small fail-closed diagnostic or correction with a
synthetic counterexample, then verify and independently review it. Do not
run a hosted observer, create or claim another journal, change live settings,
deploy, purchase, message customers or contact suppliers.

## Starting evidence

The v7 mode-0600 journal is terminal FAILED with run ID
`c66a7537-a63b-4071-baab-cd3442516ad2` and SHA-256
`d53760204f68ca4949af4be340f2dadaf4e3442abe24b91a6eb66e5f6c4d6084`.
The launcher, Keychain helper and manifest gates are disabled. The one-hour
API credential's local item and the bypass's temporary reader allowance
were removed. Individual database, provider, secret, Vercel and surface
reads succeeded separately; a serially assembled HOLD receipt passed pure
projection. This narrows but does not prove the failure's cause.

## Checks and work unit

Verify Git identity/status, the v7 journal hash/mode, disabled gates and
manifest before mutation. Inspect the concurrent composition's exact error
paths and add a deterministic injected-port test for the suspected path.
If a code correction is justified, modify only the relevant pure observer,
composition or session classifier, its tests, generated manifests, this plan
and handover. Keep error output to fixed reason codes; no provider payload,
token, URL or response body may escape. Regenerate every affected pinned
manifest, run focused and full disabled tests, live-boundary checks, then
obtain independent review. No arming diff or v8 journal is in this unit.

If the failure cannot be reproduced or safely classified, record that
uncertainty and stop. A new journal is not a diagnostic tool; any successor
requires this incident-learning gate to be closed first.

## Disabled diagnostic result

The generic classification path was reproduced with injected malformed
provider data, and a second counterexample exposed a separate loss of a
repository-merge label while the core observer settled concurrent reads.
The correction carries only finite, fixed stage codes through core,
composition and session journaling. It wraps underlying errors with a
constant message and never records response bodies, URLs or credentials.
The repository mismatch now reports `vercel_merge_unavailable`, while a
malformed provider snapshot reports `provider_validation_unavailable`.

The focused composition/session tests pass 29/29 and the complete disabled
suite passes 2,256/2,256. Both generated manifests were refreshed and
their check modes pass; `npm run check:live-boundaries` reports zero
violations. The v7 journal hash remains
`d53760204f68ca4949af4be340f2dadaf4e3442abe24b91a6eb66e5f6c4d6084`
with mode 0600; the launcher and native Keychain gate remain false.

Independent review first returned HOLD because successful but malformed
secret-inventory port responses still produced the generic label. That
specific pre-validator branch now emits
`secret_inventory_validation_unavailable`; injected `null` Supabase names
and an empty Vercel presence object prove the correction. Both focused and
full checks above were repeated after this change and the manifests were
regenerated again. A second review found the same issue for successful
surface reads returning `null` or `undefined`. The shared surface promise
now checks its envelope before dereference and retains the fixed
`surface_validation_unavailable` label through the concurrent Vercel branch;
actual read rejections retain `surface_read_unavailable`. The two injected
surface cases are covered, and focused 29/29 plus full 2,256/2,256 were
repeated again after regenerating both manifests. Final independent review
returned GO for this disabled diagnostic diff. It verified all 23 manifest
pins, false native gates, the unchanged terminal v7 journal, and the
fixed-code behavior. Its GO does not approve another hosted execution or
identify v7's historical failing stage.

This proves why a class of failures produced an unhelpful generic code,
but does **not** identify which validation or merge actually failed during
v7. The separately successful serial reads also cannot rule out a
transient or concurrency-dependent mismatch. A successor window needs its
own stage plan, fresh authorization, and an independently reviewed exact
arming diff. This diagnostic change alone is no authority to arm or run.
