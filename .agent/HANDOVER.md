# Agent handover — The Lifting Lab integration

Updated: 2026-09-22, after the v4 incident cause was found and the database observer corrected in disabled source. Read this with the actual Git state; do not trust an older commit ID if the branch has moved.

## Objective and boundary

Continue the staged integration of `theliftinglab.co.uk` and Shopify: unified account/cart/journey, qualified product and price automation, retail offers and affiliate controls, and release readiness. The public launch remains held by `docs/ops/integration-release-candidate.md`. This handover covers the immediate staging-account hosted-baseline gate. No purchases, production changes, or customer messaging are authorized by this checkpoint.

## Current state

- Repository: `implementation-integration`; branch `codex/tll-integration`; disarmed v4 base `b446921`, failure closeout `9d3ccf2`, diagnostic checkpoint `c986d7f`, then the current disabled v2 database correction. Verify `git rev-parse HEAD`, remote tracking and status before work.
- Preserve untracked `implementation-state/`, `.agent/gen11-journal-watch.mjs` and iCloud's `.agent/HANDOVER 2.md`. iCloud has also produced untracked ` 2` copies of the hosted-baseline manifest, helper and launcher; preserve them but do not add them. The hosted-baseline journal is outside this repo at `../implementation-state/staging/tll-hosted-baseline-observation.json`.
- `HOSTED_BASELINE_LIVE_ENABLED=false`, `APPROVED_NATIVE_READ=False`, and the generated hosted-baseline manifest has `nativeAccessApproved:false`. The v4 arming patch is **not** applied. Generation 21 is retired; Generation 22 is not armed.
- Source of truth for this stage: `docs/ops/stage-plans/2026-09-22-v4-hosted-baseline-incident-reconciliation.md`, the original `docs/ops/stage-plans/2026-09-22-fresh-readonly-hosted-baseline.md`, and `docs/ops/project-stage-execution-protocol.md`.

## Completed and verified

- The user approved item-specific `/usr/bin/security` Keychain access for the retained Preview bypass and a fresh one-hour Vercel Access Token for this staging window. The exact helper successfully read all three selectors in a bounded, secret-suppressed preflight.
- The v4 arming diff was mechanically equivalent in functional content to the independently reviewed v3 diff. Disabled checks passed before arming: 2231 tests, typecheck, build, lint with 0 errors/20 existing warnings, production dependency audit with 0 vulnerabilities, manifest and live-boundary checks. Disabled preflight/review checkpoints `0475593` and `cdf3ca0` were pushed.
- The exact v4 patch was locally armed at `b517942`. The launcher was invoked **once** and exited with `OBSERVATION_FAILED` / `observation_unavailable`. The exclusive 0600 journal is terminal `FAILED` for staging `qdmvngjwkcsilzmqksme`, from 19:54:23.426 to 19:54:24.029 UTC. No successful hosted baseline was obtained. Do not delete, replay or overwrite that journal.
- The v4 patch was immediately reversed and the disabled state committed locally as `b446921`; manifest and live-boundary checks passed. The isolated review worktree was disarmed and removed.
- The temporary `/usr/bin/security` allowance was removed from the retained bypass Keychain item; its `Confirm before allowing access` setting remains. The local v4 Vercel API-token Keychain item was deleted and verified absent. The remote one-hour API token was left to expire naturally. The non-expiring Preview bypass remains retained at the user's request. Vercel `Require Log In` was observed enabled before the run and was not changed.
- The disabled diagnostic correction now classifies composition construction, the six fixed read operations, observation validation and receipt projection using only finite non-secret codes. The journal reader rejects unknown failure codes but still reads the existing v4 `observation_unavailable` receipt. The diagnostic unit made **no hosted request** and did not alter any gate or journal. The correction is documented in the current stage plan.
- After the correction: 2,234 tests pass; typecheck and build pass; lint has 0 errors/20 pre-existing warnings; production dependency audit has 0 vulnerabilities; disabled manifest and live-boundary checks pass. The first focused run failed only because the manifest test's expected pin list omitted the newly pinned composition test; that list was corrected and the full suite passed.
- The direct v4 cause is now evidenced by staging Postgres logs: at 19:54:24.115 UTC, the fixed Management API SQL raised `Hosted baseline staging binding mismatch` (SQLSTATE `P0001`) as `supabase_read_only_user`. The v1 SQL's first guard required `postgres`. A single staging privilege-only query returned `can_read_authid=true` for the read-only user. Supabase SQL Editor auto-created a private `Untitled query` snippet containing only that privilege check; it was not shared. An offline real-factory construction/disposal test with inert credentials and a fetch stub passed.
- The disabled SQL is versioned v2. It now requires the Management read-only observer identity while retaining `postgres` as the expected retired operator-grant owner. All other retirement assertions remain. Focused tests (53), the full suite (2,234), typecheck, build, lint (0 errors/20 warnings), dependency audit (0 vulnerabilities), manifest and live-boundary checks pass after this correction. **The full v2 SQL has not yet been proven in staging.**

## Failure analysis and limits

The v4 Postgres log proves the first database guard failed; it does not prove the state of later reads or that the v2 query will pass. The process error was testing a canned database receipt while the real `read_only: true` request used a different SQL identity from the privileged operator checks. The diagnostic codes prevent a future generic journal, but cannot retroactively classify v4. No second hosted observer request was made.

## Next action

First verify the current disabled source, manifest, v4 journal and staging-log evidence against this handover. Independently review both the diagnostic diff (`c986d7f`) and the v2 SQL identity/operator correction for truthful classification, redaction, permissions, sibling settlement and cleanup custody. Then conduct **one separately planned read-only staging rehearsal** of the exact v2 query under `supabase_read_only_user`; a privilege boolean alone is insufficient. If it fails, reconcile without a retry. Only after this evidence may a new one-shot observer be planned with its own journal identity, credential window, exact arming diff and action-time approval. Never reuse the v4 journal or patch; do not advance deployment creation, provider repair or Generation 22 yet.

The wider remaining release work is in `docs/ops/integration-release-candidate.md`, including hosted unified sign-in/cart/orders/logout, qualified inventory and order workers, supplier-cost and VAT basis, retail pricing and flash sales, affiliate attribution/discount/refund controls, backup/restore, consent/email, scientific evidence review, theme publication and production release checks.
