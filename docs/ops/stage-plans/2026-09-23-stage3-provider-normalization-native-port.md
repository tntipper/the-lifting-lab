# Stage 3 provider normalization native port — disabled unit

## Outcome

Add an injected-only Supabase Auth Admin port for the prepared normalization contract. It must target only staging project `qdmvngjwkcsilzmqksme` and provider `custom:tll-staging-subject-broker-v1`, expose a bounded read and one exact partial-update primitive, reject unrelated input before transport, validate SDK responses, and return no secret or JWKS value in mutation receipts. No launcher or credentials are supplied in this unit.

Acceptance: focused official-SDK request tests cover the exact URL/method/body, hostile target/response/transport cases and readback separation; all gates stay false; full disabled tests, typecheck, lint, both manifest checks and live-boundary pass. A later journaled orchestrator must still enforce the single-use update.

## Starting state and boundaries

Branch `codex/tll-integration` at `543162c` has the pure disabled contract in `scripts/staging-provider-normalization-contract.mjs`. Supabase UI showed the staging provider enabled, JWKS configured, blank scopes and identifier-as-name; this is **not** an official Admin API baseline. The existing `createOfficialStagingProviderClient` closes fetch to the exact staging provider URL and propagates a bounded AbortSignal; reuse it. V8 observer journal is consumed and no live window is open. Preserve unrelated untracked files.

Only add `scripts/staging-provider-normalization-native-port.mjs`, its focused test, source pins in the activation manifest generator and fixed-list test, the generated manifest, this plan and the handover. Exclude production, hosted reads/writes, browser setting changes, new tokens, provider disablement, database/secret/flag changes, deployment, customer email, purchase and supplier order. Maximum hosted attempts: **zero**.

## Checks and failure handling

The read port requires the exact fixed target and validates the complete official provider schema. The update port derives `{enabled:false,jwks_uri:''}` from a validated pre-update response; it accepts no caller-chosen settings. It validates the SDK response as disabled/JWKS-free but does not claim final success until a separate GET passes `verifyStagingProviderNormalization`. A rejected/ambiguous update returns only a fixed error; the future journaled orchestrator must treat it as reconciliation required, never retry.

Review tightened the update acknowledgement: it now runs the full before/after provider comparison on the SDK response as well. A separate GET remains mandatory because the immediate response alone cannot prove durable state.

Before changing code, verify Git state and disabled boundaries. After code, regenerate the activation manifest, run focused tests and manifest checks, then the full disabled suite and static checks. Stop on source drift, an SDK request that targets another URL, a request that contains extra fields, an unredacted error/receipt or an enabled gate. The final native port and the pure contract require independent review before any live launcher or arming diff. The next separately planned unit must include a durable intent journal, fresh official provider/database/secret preflight, one maximum update, separate readback, disarm and recovery.

## Verified disabled result

The port reuses the existing fixed SDK client and accepts only injected project material, bounded executor and fetcher. It has no ambient credential lookup, process runner or launcher. Tests observed exactly GET → PUT → GET at the one fixed staging Auth Admin URL, with the PUT JSON limited to `enabled:false` and `jwks_uri:''`. Drifted targets and preconditions fail before transport; malformed, stale or unrelated-field responses fail closed with a fixed error. The first test used a mock envelope inconsistent with the SDK transform; correcting that fixture made the focused suite pass. The subsequent full-response guard and regression were added before final verification. Focused 14/14 and full disabled **2,324/2,324** passed. Typecheck, both manifest checks, live-boundary and diff checks passed; lint had zero errors and 20 existing warnings. No hosted request or setting change occurred. Independent review and the durable one-shot journal remain outstanding.

Before the review handoff, the port also gained a per-instance consumed flag set before its first update dispatch. An uncertain acknowledgement or a second call cannot repeat the update through that instance. This does not replace the future durable cross-process journal. The final source was re-pinned and the same focused 14/14 and full 2,324/2,324 checks passed again, plus typecheck, both manifests, live-boundary and diff checks; lint remained at zero errors and 20 existing warnings.
