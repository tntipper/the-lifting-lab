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
Preview deployment, alias change, protection bypass, Shopify change, browser
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
- No local Vercel credential source was found. The prior temporary automation
  keys were revoked. The disabled Vercel reader can be implemented and reviewed,
  but hosted execution remains blocked until an exact read-only token source is
  separately reviewed and authorised.
- Cached Supabase CLI binaries match the previously pinned hash, but there is no
  installed Vercel CLI. The baseline should prefer fixed HTTPS reads and must
  not import historical mutation-capable provider transports.

## Failure modes and preventive controls

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
