# Agent handover — The Lifting Lab integration

Updated: 2026-09-22, after the one-shot v4 hosted-baseline failure. Read this with the actual Git state; do not trust an older commit ID if the branch has moved.

## Objective and boundary

Continue the staged integration of `theliftinglab.co.uk` and Shopify: unified account/cart/journey, qualified product and price automation, retail offers and affiliate controls, and release readiness. The public launch remains held by `docs/ops/integration-release-candidate.md`. This handover covers the immediate staging-account hosted-baseline gate. No purchases, production changes, or customer messaging are authorized by this checkpoint.

## Current state

- Repository: `implementation-integration`; branch `codex/tll-integration`; disarmed v4 base commit `b446921`. Verify `git rev-parse HEAD`, remote tracking and status before work.
- Preserve untracked `implementation-state/`, `.agent/gen11-journal-watch.mjs` and iCloud's `.agent/HANDOVER 2.md`. Do not add or delete them. The hosted-baseline journal is outside this repo at `../implementation-state/staging/tll-hosted-baseline-observation.json`.
- `HOSTED_BASELINE_LIVE_ENABLED=false`, `APPROVED_NATIVE_READ=False`, and the generated hosted-baseline manifest has `nativeAccessApproved:false`. The v4 arming patch is **not** applied. Generation 21 is retired; Generation 22 is not armed.
- Source of truth for this stage: `docs/ops/stage-plans/2026-09-22-fresh-readonly-hosted-baseline.md`, the exact v4 arming review under `docs/ops/evidence/`, and `docs/ops/project-stage-execution-protocol.md`.

## Completed and verified

- The user approved item-specific `/usr/bin/security` Keychain access for the retained Preview bypass and a fresh one-hour Vercel Access Token for this staging window. The exact helper successfully read all three selectors in a bounded, secret-suppressed preflight.
- The v4 arming diff was mechanically equivalent in functional content to the independently reviewed v3 diff. Disabled checks passed before arming: 2231 tests, typecheck, build, lint with 0 errors/20 existing warnings, production dependency audit with 0 vulnerabilities, manifest and live-boundary checks. Disabled preflight/review checkpoints `0475593` and `cdf3ca0` were pushed.
- The exact v4 patch was locally armed at `b517942`. The launcher was invoked **once** and exited with `OBSERVATION_FAILED` / `observation_unavailable`. The exclusive 0600 journal is terminal `FAILED` for staging `qdmvngjwkcsilzmqksme`, from 19:54:23.426 to 19:54:24.029 UTC. No successful hosted baseline was obtained. Do not delete, replay or overwrite that journal.
- The v4 patch was immediately reversed and the disabled state committed locally as `b446921`; manifest and live-boundary checks passed. The isolated review worktree was disarmed and removed.
- The temporary `/usr/bin/security` allowance was removed from the retained bypass Keychain item; its `Confirm before allowing access` setting remains. The local v4 Vercel API-token Keychain item was deleted and verified absent. The remote one-hour API token was left to expire naturally. The non-expiring Preview bypass remains retained at the user's request. Vercel `Require Log In` was observed enabled before the run and was not changed.

## Failure analysis and limits

The current observer collapses failures after composition into the generic `observation_unavailable` reason. The 0.6-second duration does not prove which provider or operation failed. Do not diagnose Supabase, Vercel, Keychain or database health from this journal alone. This is an evidence-classification defect in the diagnostic path, not evidence that a provider needs repair. No second hosted request was made.

## Next action

First verify the disarmed repository and journal state. Then implement a **separate disabled diagnostic unit** with finite non-secret stage-specific failure codes for composition construction and the fixed Supabase/Vercel reads. Add focused tests proving classification and redaction; independently review the exact sensitive diff and run the disabled quality gates. Plan any future hosted attempt as a new one-shot with its own journal identity, fresh credential window, explicit arming review and user approval. Do not reuse the v4 journal or arming patch. Do not advance deployment creation, provider repair or Generation 22 until a valid read-only hosted baseline establishes their preconditions.

The wider remaining release work is in `docs/ops/integration-release-candidate.md`, including hosted unified sign-in/cart/orders/logout, qualified inventory and order workers, supplier-cost and VAT basis, retail pricing and flash sales, affiliate attribution/discount/refund controls, backup/restore, consent/email, scientific evidence review, theme publication and production release checks.
