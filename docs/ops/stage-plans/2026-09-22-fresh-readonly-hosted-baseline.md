# Fresh read-only hosted account baseline

## Outcome and acceptance

Capture one current, secret-free and target-bound observation of the hosted
staging account surfaces before any provider repair, deployment implementation
or Generation 22 work. This stage is complete only when:

1. the repository tip, activation manifest and disabled live-boundary policy
   match the pushed `codex/tll-integration` checkpoint;
2. one reviewed read-only launcher proves Supabase staging
   `qdmvngjwkcsilzmqksme` and excludes production
   `wrhgscovsgsudtedbljr` before credential access or network I/O;
3. one fixed database `BEGIN READ ONLY` observation confirms the canonical
   Generation 21 retired state: migrations 002--016 installed, five controls
   disabled, five runtime roles NOLOGIN with no passwords, `VALID UNTIL
   infinity`, five ADMIN-only operator edges, no execution edges and zero
   runtime sessions;
4. the full existing custom-provider projection is read through an official,
   documented read-only API and records enabled state, exact endpoints, client
   identity, scopes, PKCE, email policy and JWKS state without returning a
   secret value;
5. Vercel proves the pinned project name/ID, team ID/scope, Preview branch and
   stable alias, and records the connected Git provider/repository ID from a
   documented authenticated project response;
6. Vercel Preview and Supabase Edge inventories prove only whether the single
   broker-secret name is present; no configuration value is read;
7. the broker Edge runtime and immutable readiness route return one of their
   exact reviewed secret-free states, and the alias/deployment/source identity
   agrees with the pinned branch and project;
8. the launcher performs no mutation, retry, redirect, browser action or
   credential generation, writes one exclusive mode-0600 secret-free evidence
   receipt, then is disarmed; and
9. the disabled outcome, evidence hash, independent reviews and exact next hold
   are committed and pushed.

## Exclusions

This stage performs no provider update or disablement, secret/environment
write, database write, role/login/password change, function deployment,
Preview deployment, alias change, protection-setting change, Shopify change, browser
sign-in, customer email, cart operation, checkout, purchase, supplier order,
production request or Generation 22 creation/arming. A read-only baseline is
evidence, not permission for the next mutation.

## Authoritative starting state

- Branch `codex/tll-integration` starts this stage at
  `036753fff82b2d31e7fab09133105572719633ed`; the remote was verified equal.
- The implementation checkpoint is `cc18fda`; its focused binding/manifest
  baseline passes 31/31 and the live-boundary check passes.
- Generation 21 is consumed, recovered and non-replayable. Its last secret-free
  retirement evidence is retained under `implementation-state/staging/` but is
  drift-prone and cannot substitute for this observation.
- All native/live gates are false. Deployment creation remains unavailable
  because the Vercel connected repository ID is not pinned.
- Preserve untracked `implementation-state/` and
  `.agent/gen11-journal-watch.mjs`; do not stage them.

## Planned repository and hosted surface

The exact file set will be revised after source/API inspection, before code is
written, if a required proof cannot be expressed through a closed operation.
The intended surface is:

- `scripts/staging-account-hosted-baseline.mjs` plus focused tests for the
  injected-only orchestration and secret-free result;
- `scripts/staging-account-hosted-baseline-database.mjs` plus focused tests for
  the exact current retired-state read-only transaction;
- `scripts/staging-account-hosted-baseline-vercel.mjs` plus focused tests for
  the documented project/link and Preview environment-name reads;
- one dedicated `*-readonly-live-launcher.mjs` and exact credential helper(s),
  all disabled by default and rejected by ordinary tests;
- one generated pin/manifest for the reviewed baseline package;
- this stage plan, a secret-free evidence receipt outside Git and final
  handover updates.

Hosted reads may include only documented Vercel project/alias/deployment/env
name endpoints, documented Supabase Auth/provider and Edge secret-name
operations, the fixed Edge protocol probe, the fixed immutable readiness GET
and one Supabase Management API database request whose SQL is an immutable
read-only transaction. The launcher accepts no caller URL, project, SQL,
command, environment name, provider identifier or output path.

## Required pre-execution evidence

Before implementing or arming the launcher, source inspection and independent
review must establish:

- the exact Vercel project response path and field containing the connected
  Git provider/repository ID;
- the exact Supabase read-only provider contract and credential authority;
- the exact secret-name list shapes from both platforms;
- the current local credential sources without printing, copying or persisting
  values;
- an abortable process/HTTP boundary that settles before terminal evidence;
- actual streaming response limits and fixed-error redaction; and
- that every requested proof can be obtained without a write-capable generic
  CLI/API escape hatch.

If any provider field is undocumented, the relevant proof remains a named hold.
Browser scraping, guessed schemas, environment-value enumeration and raw CLI
output are not substitutes.

### Evidence discovered during planning

- Vercel's documented `GET /v9/projects/{idOrName}` response supplies the
  connected repository identity at `link.repoId`, with `link.type`, `repo`,
  `org`, `repoOwnerId`, `productionBranch` and `sourceless`. The fixed request
  uses the pinned project ID and team ID.
- Vercel Preview environment-name evidence uses documented
  `GET /v10/projects/{projectId}/env` with exact `target=preview` and
  `gitBranch=codex/tll%2Fintegration`. It may project names and target metadata
  only; `/env/{id}` and decrypted values are forbidden.
- The Supabase Management API Keychain credential exists and can support the
  fixed current-state database observation and Edge secret-name list. The old
  preflight/reconcile queries are tied to historical states and cannot be
  relabelled; this stage needs a new pinned read-only transaction.
- The official Supabase custom-provider `getProvider` path requires a project
  secret/service key. The documented read-only Management API path
  `GET /v1/projects/{ref}/api-keys?reveal=true` can supply the existing legacy
  `service_role` key transiently to the official SDK. The disabled binding
  selects exactly one such record, clears parsed key fields and Buffer copies,
  and never returns the value. This still reads powerful credential material;
  the arming review must verify the exact in-memory path and bound process
  lifetime before hosted execution.
- The database binding uses the fixed Management API query endpoint with both
  `read_only: true` and an immutable `BEGIN READ ONLY` transaction. The
  documented success status is 201. Its SQL now compares the complete retired
  Generation 21 marker, including the reviewed historical expiry, and has an
  engine-backed local PostgreSQL regression.
- The documented Supabase secrets endpoint
  `GET /v1/projects/{ref}/secrets` supplies names; values are discarded. The
  documented Vercel Preview environment list is accepted only when its first
  bounded page is explicitly terminal, so absence cannot be inferred from an
  incomplete page.
- The local Git remote is `tntipper/the-lifting-lab`. The Vercel project read
  and deployment `gitSource` must agree on the repository ID, GitHub provider
  and `codex/tll-integration` source branch before a receipt is returned.
- Vercel does not document the TLL-specific `meta.tllManifestSha256` field and
  no concrete writer currently exists. A valid value is retained as application
  evidence; absence is recorded as `application_manifest_evidence_absent` and
  makes the observation `HOLD`. It is never invented from Git metadata.
- No local Vercel Management API credential source was found. Previously used
  temporary automation keys were revoked; a masked bypass entry visible in the
  current project UI has not been qualified for this run. Hosted execution
  remains blocked until the separate API and protection credentials are
  provisioned and independently checked for their exact uses.
- Cached Supabase CLI binaries match the previously pinned hash, but there is no
  installed Vercel CLI. The baseline should prefer fixed HTTPS reads and must
  not import historical mutation-capable provider transports.

## Failure modes and preventive controls

### 2026-09-22 arming review correction

The independent review of the first three-file arming patch returned **HOLD**.
The current Vercel project UI shows **Require Log In** enabled for Preview.
The immutable readiness GET would receive a protection challenge because it
currently sends no deployment-protection credential. The same review found that
the planned Keychain value called an automation key is actually used as a
Vercel Management API bearer token. Vercel documents these as separate token
types. The first arming patch is superseded and must not be applied or run.

Before another arming candidate, the disabled package must use three separate
credential sources: the existing Supabase Management credential, a short-lived
Vercel Access Token scoped to the pinned team and used by this launcher only for
the fixed REST reads, and
a short-lived project automation-bypass secret sent only as the
`x-vercel-protection-bypass` header on the fixed immutable readiness GET.
The bypass must never enter a Management API Authorization header, URL, query,
Edge request, evidence receipt or error. The API token must never enter the
readiness or Edge request. Neither credential may be printed or committed.
The project protection setting stays enabled. Both temporary Vercel credentials
must be revoked immediately after the single observation and their Keychain
entries removed. An existing masked automation-bypass entry in project settings
is not proof that its value is available or appropriate for this window.

Credential presence and format must be checked before claiming the exclusive
observation journal, with all acquired buffers wiped on failure. The journal
must still be claimed before any hosted request. The disabled correction needs
fake-response tests proving exact header separation and a protected 401 fails
closed; it must pass the full local stage gates and independent review before a
new minimal arming patch is prepared. Creating either Vercel credential and
using the bypass are separate action-time approval gates in the browser UI.

### 2026-09-22 pre-journal module-cycle incident

The reviewed v2 gates were committed locally and the launcher was invoked
once. Node exited with code 13 and reported an unsettled top-level await at
the launcher's `await runHostedBaselineLiveOnce()`. No observation journal was
created, no child process remained, and no hosted request could have begun:
the launcher imports its manifest before credential access or journal claim.
The branch was immediately disarmed and the disabled boundary rechecked.

Direct cause: the launcher dynamically imports the manifest during its
top-level await, while the manifest statically imports the launcher's gate
constant. ESM waits for the entry module to finish before evaluating its
dependent manifest, while the entry waits for that manifest. The process
decision that allowed this was verifying the manifest as its own entry point
and testing injected session code, without checking the armed launcher's
module graph as an entry point. The minimal arming diff left this pre-existing
cycle unchanged, so diff review alone could not reveal the runtime deadlock.

Corrective unit: keep both native gates disabled; remove the reverse manifest
import of the launcher and derive approval from the pinned launcher source (or
an inert dedicated gate module); add a regression that rejects any manifest
import path from the manifest to the live launcher, directly or transitively,
while ordinary tests continue checking the disabled manifest without invoking
the live entry point.
Regenerate source pins, rerun focused and full disabled checks, and obtain an
independent source review before another arming candidate. The new candidate
requires its own exact-diff review. Do not replay the just-failed invocation
or treat the absent journal as proof that the attempt did not occur. Revoke
both temporary Vercel credentials and remove their local selectors before
preparing a fresh credential window. No production or purchase action occurred.

The cleanup is complete. Vercel showed successful removal of the newly named
one-hour token `tll-hosted-baseline-readonly-2026-09-22` and of the bypass
noted `TLL staging read-only baseline, one run, 2026-09-22`. The earlier bypass
entry (added one day before) remains, and Preview `Require Log In` remains
checked. Both fixed local Keychain selectors return absent; the Supabase CLI
selector was untouched. The observation journal remains absent. The corrected
disabled checkpoint `7f8052e` was pushed after 2231/2231 tests, typecheck,
build, lint with zero errors, audit, both manifest checks and the live-boundary
check. Independent review accepted the import-graph correction. This closes
the incident without treating the failed launcher invocation as a completed
baseline observation.

### 2026-09-22 v3 credential preflight hold

The independently reviewed v3 arming patch (SHA-256
`26656202a1a18eeba01e27248b3110965f9d93276883c66b9999893f3534718e`)
was applied exactly to the disabled checkpoint and committed as `41b02a7`.
The launcher was invoked **once** and returned the allowlisted
`CREDENTIAL_UNAVAILABLE` result in 18 seconds. The exclusive journal is absent,
so no hosted request or baseline observation was made. The gates were immediately
disarmed in `a46e510`; the disabled manifest, boundary check and all 2231 tests
pass. This attempt must not be replayed under the same credential window.

The three expected Keychain records existed. Secret-suppressed value-read
diagnostics returned success for Supabase CLI and the new Vercel API token, but
the new Preview bypass value read did not settle within a four-second diagnostic
limit. Subsequent read-only inspection of that item's Keychain Access Control
tab showed `Confirm before allowing access` selected and an empty allowed-app
list. This explains why an unattended `/usr/bin/security` read could stall;
the exact macOS prompt behaviour during the failed launcher was not captured.
The launcher correctly failed closed before claiming the journal. The process
error was attempting the armed run after checking Keychain item *existence* but
not value readability through the exact helper/process boundary. Before another
arming candidate or credential window, qualify each selector with a bounded,
secret-suppressed value-read check from the same process context, confirm no
unanswered Keychain prompt, and record only success/failure and duration. A
future credential setup must use an explicit, narrowly reviewed Keychain access
path for the helper; do not switch the item to `Allow all applications` merely
to avoid the prompt. Keep the launcher disabled and independently review any helper or credential-ACL
change before another one-shot attempt.

The user directed that the one-hour Vercel API token expire naturally and that
the new, non-expiring Preview bypass be kept for a later test. Its removal
dialog was dismissed without deletion. Vercel still showed two bypasses and
`Require Log In` enabled. The retained bypass is not proof that its Keychain
value can be read by the launcher; no new observation is authorized by its
presence.

### 2026-09-22 v4 credential preflight

The user approved a temporary item-specific Keychain allowlist for
`/usr/bin/security` on the retained Preview bypass. The item briefly showed
`Allow all applications` after concurrent user interaction; this was restored
to `Confirm before allowing access` and saved before any credential read.
Only `security` is listed as allowed. A first secret-suppressed preflight then
read Supabase and the retained bypass, but the v3 Vercel API-token item timed
out. Read-only inspection found that item also had an empty allowlist.

The user separately approved a fresh one-hour Vercel Access Token scoped to
the exact `the-lifting-lab` project, replacement of only the local fixed
Keychain selector, and an item-specific `/usr/bin/security` allowance on that
new record. The previous remote token was left to expire naturally as directed.
Both Vercel Keychain items now show `Confirm before allowing access`, with
`security` as their sole allowed application. A bounded, secret-suppressed
read using the helper's exact `/usr/bin/security find-generic-password -w`
command and environment returned `READABLE` for Supabase, Vercel API and
Preview bypass (0.04s, 5.01s and 3.47s respectively). No credential value
was printed, saved in evidence or committed. The journal was absent, and the
live gates remained disabled throughout this preflight.

This is a new credential window, not a replay of the v3 invocation. Before
arming, regenerate this manifest's stage-plan pin, rerun disabled checks,
prepare a fresh exact three-file arming diff, and review that exact diff.
The retained bypass remains restricted to the fixed immutable readiness GET.
After one launcher invocation, immediately disarm, remove both temporary
`security` allowlist entries and the local v4 API-token record, and leave
Vercel's `Require Log In` enabled. The user chose to retain the remote bypass;
it must not be removed as part of this window.

### 2026-09-22 v4 one-shot outcome and diagnostic gate

The exact v4 patch was applied to disabled checkpoint `cdf3ca0` and committed
locally as armed `b517942`. The launcher was invoked **once**. It exited 0 and
reported `OBSERVATION_FAILED` with only `observation_unavailable`. The exclusive
0600 journal at `../implementation-state/staging/tll-hosted-baseline-observation.json`
is terminal `FAILED` for staging target `qdmvngjwkcsilzmqksme`; its timestamps
span 19:54:23.426–19:54:24.029 UTC. This is not a successful hosted baseline.
The generic reason code does not identify the failing provider or operation,
and the short duration alone is insufficient to infer one. Do not delete or
replay this journal.

The v4 patch was immediately reversed and the disabled state committed locally
as `b446921`; manifest and live-boundary checks passed. The temporary
`/usr/bin/security` allowlist was removed from the retained Preview bypass,
which remains on `Confirm before allowing access`; the local v4 API-token
Keychain item was deleted and verified absent. The remote one-hour API token
was left to expire naturally, following the user's prior preference. The
remote Preview bypass remains retained for a later approved test. No purchase,
production change or provider repair occurred.

Before any new credential window or hosted request, design a **separate
disabled diagnostic unit** that reports finite, non-secret stage-specific
failure codes for composition construction and the fixed Supabase/Vercel reads.
Test redaction and failure classification, review the exact diff independently,
then verify the disabled boundary. The existing journal remains immutable; a
new one-shot would require its own journal identity and fresh authorization.
Do not arm Generation 22 or implement deployment creation from this failed
baseline.

- Target, team, branch, alias, provider or source drift stops before subsequent
  reads and records only an allowlisted reason.
- Authentication failure records only the provider and status class. It does
  not create a token, request broader access or fall back to browser automation.
- Redirects, compressed responses, ambiguous framing, malformed JSON,
  oversized headers/bodies and response URL drift fail closed.
- Each external read has one fixed deadline and no retry. An abort is terminal
  only after the request/process and response stream settle.
- Secret-bearing inputs remain Buffer/private descriptor material and never
  reach argv, environment, evidence, errors or committed files.
- The exclusive observation journal is created before the first request. An
  existing journal, any dispatch uncertainty or any response-shape mismatch
  prevents a second run.
- Any unexpected secret-name presence, configured JWKS, production identifier,
  enabled application surface or target mismatch ends the stage without repair.

## Review, execution and closeout gates

1. Implement and test the disabled read-only contract and launcher.
2. Independently review target identity, official response schemas, credential
   handling, cancellation settlement, redaction and evidence projection.
3. Run focused tests, manifest checks, lint, typecheck, audit,
   `check:live-boundaries` and `git diff --check`; commit/push the disabled unit.
4. Prepare a separate minimal arming diff for only this read-only launcher and
   credential helper. Review that exact diff independently. Do not run ordinary
   tests while the boundary is armed.
5. Execute the launcher once with a fixed overall deadline. No retry is
   permitted, including after partial or ambiguous output.
6. Inspect the secret-free evidence, immediately disarm, regenerate pins and
   rerun the disabled boundary checks.
7. Commit/push the observed outcome and update `.agent/HANDOVER.md`.

The next stage depends on the result. If the connected repository identity and
all target pins pass, implement deployment creation as a separate disabled and
reviewed unit. Provider repair/disablement is another stage and is permitted
only if this baseline proves the exact repairable state with no configured
JWKS. Generation 22 remains later and separate.
