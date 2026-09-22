# Agent handover — The Lifting Lab integration

Updated: 2026-09-22 after the disabled hosted-baseline credential correction

## Exact repository state

- Repository: `implementation-integration`
- Branch: `codex/tll-integration`
- Hosted-baseline checkpoint: `690ca06` (`Add reviewed staging hosted baseline observer`),
  followed by the credential correction recorded below. Verify the current
  branch tip before applying any future arming patch.
- Remote branch was pushed to `origin/codex/tll-integration`.
- Previous concrete binding checkpoint: `cc18fda`.
- Preserve untracked `implementation-state/` and
  `.agent/gen11-journal-watch.mjs`; neither belongs in a commit. An untracked
  `.agent/HANDOVER 2.md` iCloud copy is also present; preserve it.
- Production Supabase `wrhgscovsgsudtedbljr` remains excluded.

## Safety and hosted state

- Generation 21 remains retired, consumed and non-replayable. Its verified
  retirement evidence is under `implementation-state/staging/`.
- No Generation 22 package exists or is armed.
- The new hosted-baseline launcher is deliberately disabled. Running it without
  a later reviewed arming change returns `HOSTED_BASELINE_LIVE_DISABLED` with
  `nativeAccessApproved:false`.
- This stage made no Keychain read, credential read, network request, hosted
  request, database query, deployment, provider/secret change, customer action,
  purchase or production change.
- No new Vercel credentials were created or used in this correction. The project
  UI shows Preview `Require Log In` enabled and one masked bypass entry, which
  does not prove that a qualified bypass value is available. Do not reuse an
  old revoked test key.

## Completed work unit

Checkpoint `690ca06` adds a manifest-pinned, read-only staging observer for the
fresh hosted baseline described in
`docs/ops/stage-plans/2026-09-22-fresh-readonly-hosted-baseline.md`.

It is fixed to:

- Supabase staging `qdmvngjwkcsilzmqksme` and excludes production;
- Vercel project `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4`, team
  `team_gf7cgIkkoeMLtODFDDT5MrW4`, scope `my-lifting-lab-s-projects`, project
  `the-lifting-lab`, branch `codex/tll-integration`, and repository
  `tntipper/the-lifting-lab`;
- the exact Generation 21 retired database receipt in one read-only transaction;
- full custom-provider readback, broker-secret name absence, immutable Preview
  deployment/source evidence, stable alias, readiness and Edge state.

The package exposes no generic SQL, URL, target, process or mutation input. It
uses bounded response bodies, exact status/framing/identity checks, one-shot
bindings, linked cancellation, settled cleanup, and secret-free allowlisted
receipts. Raw and copied credentials are wiped. Cleanup uncertainty preserves
the intent journal and returns `RECONCILIATION_REQUIRED`; it cannot create a
misleading terminal receipt.

Independent review repeatedly exercised the package and found/corrected:

- incomplete manifest dependency closure;
- lost native `Response` properties;
- credential-buffer and partial-constructor cleanup leaks;
- terminal journaling before cleanup/settlement;
- weak nested receipt/status/reason validation;
- identifier coercion and missing length bounds;
- ordinary-operation versus cancellation-cleanup error confusion; and
- a vacuous identifier regression test.

Final independent review reported no actionable findings for the corrected
disabled package. Verified final source hashes were:

- session: `d257d4eade35b96ff0187df5ec194f3cdfdf4828fa29bf8cce0f293d550bd046`;
- session test: `b6ea4dfb358375d8404bdf2e4c3f6e26c8d849e7605e8e86d6d825bcbe46c4e2`;
- generated manifest: `5d4bf61e793ffa3a083eda8b35b56cf5f7d798e1fd46c6db68a019abadc6aad2`.

## Verification at `690ca06`

- Hosted-baseline focused suite: 65/65 passed.
- Session/manifest focused suite: 14/14 passed.
- Complete `npm test`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; 153 pages generated.
- `npm run lint`: zero errors and the same 20 pre-existing warnings.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.
- Hosted-baseline and existing activation manifest checks: passed.
- Live-boundary policy: PASS with zero violations.
- Python helper compilation and `git diff --check`: passed.

## Corrected disabled package and next action

The first arming candidate at
`docs/ops/evidence/2026-09-22-hosted-baseline-arming-review.patch` is
**superseded and must never be applied**. An independent reviewer found that
it would send an unprotected readiness GET to a protected Preview and treated a
Vercel automation-bypass key as a Management API bearer token. Its uncommitted
armed review worktree was removed after confirming it contained only that saved
candidate. The current integration branch remains disabled.

The disabled correction uses three separate credential selectors: Supabase
Management, a temporary Vercel Access Token for fixed Management API reads,
and a temporary project automation-bypass value for the immutable readiness GET
only. It does not send either Vercel credential to the Edge probe. Credential
format/size is checked before the exclusive journal claim; missing or invalid
credentials return `CREDENTIAL_UNAVAILABLE` without consuming the run. The
reviewer identified an initial Vercel length mismatch; preflight now enforces
the API binding's 512-byte and surface binding's 1024-byte limits, with tests
that prove no claim, no composition and buffer wiping for oversized values.

The original review's two P1 findings were resolved. Independent targeted
re-review accepted the final size-limit fix with no residual finding. Focused
tests pass 70/70; complete `npm test` passes 2230/2230.
Typecheck, build (153 pages), audit (zero high production vulnerabilities),
both manifest checks, live-boundary check and diff check passed. Lint has zero
errors and the same 20 existing warnings. No hosted request was made.

### Separate arming gate

Do not implement or run Generation 22. Resume with a small, separate arming
stage for the read-only baseline only:

The new minimal arming candidate is saved at
`docs/ops/evidence/2026-09-22-hosted-baseline-arming-review-v2.patch`
(SHA-256 `098cb59546cd713a28a08156dc678a5984cb0ba2aa18b52cca8be10b5a6c7a5f`).
It is based on disabled commit `5080ac6` and changes only the launcher gate,
matching Keychain-helper gate and generated manifest. Independent review
accepted the exact patch with all 22 source pins matching and no actionable
finding. `git apply --check` passed on the disabled branch. The earlier patch
remains superseded. The integration branch stays disabled until credentials,
journal state and action-time approvals are ready for the one bounded run.

1. Verify `pwd`, branch, `HEAD`, remote, and working tree against this handover.
2. Confirm current manifest hashes and rerun the focused baseline tests, both
   manifest checks and the live-boundary check. Do not repeat the full audit.
3. Verify the saved v2 patch and its exact source checkpoint before applying.
   Its independent review accepted no writes, deployments, generic targets or
   production access, with all manifest pins preserved. Do not run ordinary
   tests in an armed worktree. Apply/commit it on the main integration branch
   only when the run is ready; any further source edit invalidates this review.
4. Obtain a temporary Vercel Access Token for the Management API and a separate
   project automation-bypass value for protected Preview readiness. Keep them
   in their distinct fixed Keychain selectors, then revoke both and remove the
   selectors immediately after the one bounded read-only run. Vercel Access
   Tokens can have broader account/team permissions than this launcher's fixed
   GETs; verify team scope and action-time approval. Do not expose values in
   chat, logs or evidence.
5. Use the existing approved Supabase CLI account only for the fixed staging
   Management API reads. The launcher may transiently reveal the one legacy
   staging service-role key in memory for the fixed read-only database call; it
   must wipe it and never persist or print it.
6. Run the baseline once. If the journal remains at `INTENT_RECORDED`, stop and
   reconcile; never retry blindly. A `HOLD` is valid evidence and must not be
   converted to PASS.
7. Revoke/remove the Vercel key, verify protection remains active, archive only
   the secret-free receipt, and independently review the observation.

Expected HOLDs include absent TLL application-manifest metadata or drift in the
existing custom-provider settings. The read-only observation must finish before
deciding whether to reconcile provider settings, pin the connected repository
ID, or build disabled deployment creation. Those remain later, separate stages.

## Programme work after the baseline

The public launch remains held by
`docs/ops/integration-release-candidate.md`, including hosted unified
sign-in/cart/account/orders/logout acceptance, qualified inventory and order
workers, approved mappings and supplier-cost evidence, retail pricing and flash
sales, affiliate attribution/discount/commission/refund controls, backup and
restore rehearsal, consent/email flows, scientific evidence review, theme
publication and production deployment. No purchase is authorized.

## Authoritative pointers

| Purpose | Path |
|---|---|
| Current stage plan | `docs/ops/stage-plans/2026-09-22-fresh-readonly-hosted-baseline.md` |
| Hosted-baseline manifest | `config/staging-account-hosted-baseline-manifest.json` |
| Existing activation manifest | `config/staging-account-activation-manifest.json` |
| Activation runbook | `docs/ops/staging-account-activation.md` |
| Execution protocol | `docs/ops/project-stage-execution-protocol.md` |
| Broader release gates | `docs/ops/integration-release-candidate.md` |
| Retail/promotions/affiliate controls | `docs/ops/retail-promotions-affiliate-controls.md` |
