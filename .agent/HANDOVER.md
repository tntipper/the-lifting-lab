# Agent handover — The Lifting Lab integration

Updated: 2026-09-22 after the pre-journal module-cycle incident and disabled correction

## Exact repository state

- Repository: `implementation-integration`
- Branch: `codex/tll-integration`
- Incident checkpoint trail: pushed disabled `e0f8d3`, local armed `f777dc3`,
  local disarmed `8d35faa`; the pending disabled correction follows. Verify
  the actual tip and remote before any new change.
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
- The reviewed arming patch was committed locally as `f777dc3` and the live
  launcher invoked once. Node exited 13 with an unsettled top-level await
  before any journal claim or hosted request. The journal path remains absent;
  no child process remained. The branch was disarmed at `8d35faa` and the
  disabled launcher and live-boundary policy pass again. Never replay that
  attempt or use its v2 patch again.
- A one-hour Vercel Access Token scoped to the-lifting-lab and a new project
  bypass were created for that attempt. Neither was used by the launcher.
  Both were deleted in Vercel and their local Keychain entries were deleted
  and verified absent. The older masked bypass remains and Preview `Require
  Log In` is still checked. The Supabase CLI selector was untouched.

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

### Current hold and next stage

Do not implement or run Generation 22. The two earlier arming patches,
`2026-09-22-hosted-baseline-arming-review.patch` and its `-v2.patch`, are
**superseded**. Do not apply either. The v2 patch was executed exactly once,
but an ESM cycle prevented its manifest from loading. The manifest imported
the launcher gate while the launcher awaited a dynamic import of the manifest.
This is documented in the stage plan's incident section.

The disabled correction removes that reverse import and parses the pinned
launcher gate from source. Independent review confirmed the root cause and
accepted a recursive static import-graph regression test after removing a
test that improperly invoked the real launcher. The corrected disabled package
was committed and pushed as `7f8052e`; it needs a **new** arming diff and
independent review.
Focused tests passed 71/71 and the complete suite passed 2231/2231. Build,
audit, both manifest checks and live-boundary check passed; lint has zero
errors and the same 20 existing warnings. Typecheck was rerun after removing
three duplicate generated `.next/types/* 2.ts` iCloud files; the duplicate
files were generated output, not repository source. The two remote temporary
credentials were revoked and the incident is closed. No new credential window
has started.

1. Verify branch, tip, worktree, absent journal and disabled gates. The incident
   is closed in the stage plan with the exact external state and checks.
2. The new minimal candidate is saved as
   `docs/ops/evidence/2026-09-22-hosted-baseline-arming-review-v3.patch`
   (SHA-256 `26656202a1a18eeba01e27248b3110965f9d93276883c66b9999893f3534718e`).
   It is based on pushed disabled commit `419cc8a`, changes only the two gates
   and regenerated manifest, and was independently accepted with all 22 pins
   matching. Its temporary armed review worktree was removed. The integration
   branch remains disabled. The old v2 patch is superseded and cannot be reused.
3. At a later separately approved action window, create two new short-lived
   credentials in their distinct Keychain selectors, verify the journal is
   absent and invoke the new reviewed launcher once. If it records intent or
   returns HOLD/FAILED, preserve and reconcile; never retry blindly.

Expected HOLDs include absent TLL application-manifest metadata or drift in the
existing custom-provider settings. The read-only observation must finish before
deciding whether to reconcile provider settings, pin the connected repository
ID, or build disabled deployment creation. Those remain later, separate stages.

### 2026-09-22 v3 attempt update

The user approved one new temporary credential window. The exact independently
reviewed v3 patch was applied at its recorded SHA and armed in `41b02a7`.
The launcher was invoked once and returned `CREDENTIAL_UNAVAILABLE` before
the observation journal or any hosted request. It was disarmed in `a46e510`;
the disabled manifest, live-boundary check and all 2231 tests pass. **Do not
rerun that window.** The new Vercel API and bypass Keychain records existed,
but a secret-suppressed diagnostic showed the bypass value read timing out,
while the Supabase and Vercel API token value reads succeeded. Read-only
Keychain Access inspection then showed the bypass item set to `Confirm before
allowing access` with no allowed application listed. The missed precondition was value
readability in the launcher's process context, beyond item existence.

Before any new credential/arming window, implement and verify a bounded,
secret-suppressed preflight of all three selectors through the same process
context; use a narrowly reviewed Keychain access path without `Allow all
applications`; keep native gates
disabled; obtain independent review of any code or access-control change.
The stage plan records the incident and next gate. Temporary Vercel credential
status must be checked before any new window. The user directed that the
one-hour Vercel API token expire naturally. The newly created Preview bypass
has no stated expiry. The user explicitly chose to keep it for a later test;
its removal dialog was dismissed. Vercel still showed two bypasses with
`Require Log In` enabled. Leave both bypasses untouched until a later user
decision. The new bypass's local Keychain item remains with the access-control
limitation above.

The next continuation checked branch `codex/tll-integration` and an absent
observation journal. Keychain Access confirmed the retained bypass still has
`Confirm before allowing access` and an empty allowlist. The exact
`/usr/bin/security` file was selected for a proposed temporary, item-specific
allowlist, but the final Add action was **not** taken while the computer-use
access-grant confirmation remained unanswered. The chooser was cancelled;
the ACL is unchanged. No credential read, arming or hosted request occurred.
The stage-plan edits had made the disabled manifest stale; it was regenerated,
and 19 focused tests plus the live-boundary check passed. That disabled
manifest fix was pushed as `a70b521`. Resume at the pending Keychain
access-grant decision, then run a bounded secret-suppressed value-read
preflight for all three selectors before preparing a new arming candidate.

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
