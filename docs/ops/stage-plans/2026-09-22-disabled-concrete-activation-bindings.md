# Disabled concrete activation bindings

## Outcome and acceptance

Implement the concrete bounded executor and provider dependencies required by
the reviewed adapters while every native/live gate remains disabled. Implement
only surface dependencies whose target identity can be proved from committed
pins; leave deployment creation unavailable until a fresh Vercel project
baseline supplies the connected repository identity.
This stage is complete only when:

1. a bounded executor supplies an AbortSignal, applies one fixed deadline and
   returns `COMPLETED` only after the operation and response body have settled;
2. cancellation never becomes a success receipt and an uncertain mutation is
   left for the state-machine reconciliation path rather than retried;
3. child processes are exact-command, bounded-output, minimal-environment,
   credential-safe operations that are killed and reaped before cancellation
   settles;
4. HTTP and official SDK operations use fixed HTTPS targets, reject redirects,
   propagate the executor signal and expose only redacted structured evidence;
5. Supabase staging `qdmvngjwkcsilzmqksme`, Vercel project
   `the-lifting-lab`, scope `my-lifting-lab-s-projects`, Preview branch
   `codex/tll-integration` and the reviewed stable alias are immutable inputs;
6. production `wrhgscovsgsudtedbljr`, caller SQL, caller URLs, caller commands,
   caller projects and generic shell/API escape hatches are rejected before I/O;
7. secrets enter only as Buffers, use stdin/private descriptors or fixed HTTPS
   authorization bodies, and never reach argv, environment, result objects,
   diagnostics, journals or committed files;
8. every native-enable constant remains false, no live launcher or Generation
   22 package is added, and the live-boundary check passes; and
9. the official Supabase SDK is constructed from the project root and tests
   prove it requests `/auth/v1/admin/custom-providers/...` exactly once; and
10. focused tests, full tests, typecheck, lint, build, generated-artifact checks
   and independent security review pass.

## Exclusions

This stage performs no hosted baseline read, provider disablement, provider or
secret mutation, database query, deployment, alias change, browser sign-in,
credential generation, customer email, checkout, purchase, supplier order or
production change. It does not arm or create Generation 22. It does not access
Keychain or add a native launcher.

## Authoritative starting state

- Branch `codex/tll-integration` starts at `44e1a0f`.
- Generation 21 is retired and non-replayable; runtime identities are inert and
  all five database/application controls are disabled.
- The adapter checkpoint `ec62e32` passed independent review and the full suite,
  but its provider/surface host operations require injected concrete bindings.
- The last provider and hosted evidence is drift-prone and is not an input to
  ordinary tests.
- Preserve untracked `.agent/gen11-journal-watch.mjs` and
  `implementation-state/`; neither belongs in a commit.

## Planned repository surface

- Add one bounded-executor module and focused tests.
- Add one provider-binding module and focused tests for the official Supabase
  Auth Admin client plus exact Vercel/Supabase secret operations and frozen-state
  projection.
- Add surface bindings and focused tests only for exact Vercel/Supabase
  operations, alias/TLS/readiness evidence and command construction supported
  by committed target pins. Deployment creation remains a fixed unavailable
  operation until the repository identity is captured and reviewed.
- Reuse pinned runners and parsers only where their complete contracts match.
  Extract a shared helper only when tests prove existing behavior is unchanged.
- Update the activation manifest, runbook and handover after the bindings pass
  independent review.

## Required pre-implementation evidence

Source inspection must establish:

- which existing process runner can be killed and reaped with bounded output;
- how the official Auth Admin client receives an AbortSignal through its fetch;
- which Vercel CLI/API response proves project, Preview branch, deployment,
  source commit and alias identity without relying on response headers invented
  by this repository;
- which Supabase Edge operation sets the single flag and which independent
  response proves its effective value; and
- whether Vercel configuration values can be read safely. If they cannot, the
  binding must use the deployed readiness contract and may not substitute
  environment-name presence.

An unsupported proof stops this stage or remains an explicit pre-arming hold;
browser scraping, generic command execution and secret-value enumeration are
not substitutes.

### Evidence discovered during planning

- `@supabase/supabase-js` expects the project root and appends `/auth/v1`.
  The existing adapter constant incorrectly contained `/auth/v1`; this stage
  must correct it and test the generated request URL.
- The manifest pins the Vercel project ID but does not pin the connected Git
  repository ID. A REST deployment request cannot safely be constructed from a
  guessed repository or caller metadata. Deployment creation therefore remains
  unavailable until the next fresh read-only Vercel baseline records that ID.
- Vercel environment listings and Supabase secret listings prove names, not
  Boolean values. Web flag values must come from the immutable deployment
  readiness route; Edge state must come from the exact broker runtime response
  (`503 temporarily_unavailable` when held, or the reviewed enabled protocol
  response after credentials exist).

## Failure modes and preventive controls

- Timeout aborts once. A mutation is never retried inside a binding.
- A child is not classified cancelled until its close event is observed. If it
  cannot be reaped, the executor remains unavailable and later mutation is
  forbidden.
- A fetch/SDK call is not classified cancelled until its promise settles after
  abort. Raw response bodies and errors are discarded.
- Malformed, oversized, redirected, duplicate or target-drifted responses fail
  with one fixed error and no diagnostic echo.
- A binding exposes closed named operations only. It cannot accept arbitrary
  command arrays, URLs, SQL, environment names or provider identifiers.
- Ordinary tests inject process/fetch/client fakes and fail if a real process,
  socket, credential reader or hosted operation is reached.

## Review, verification and closeout

Review the executor, provider bindings and surface bindings as separate units.
After corrections, run the focused suites, complete `npm test`, typecheck, lint,
build, `npm audit --audit-level=high`, `npm run check:live-boundaries`, manifest
`--check` and `git diff --check`. Commit and push only the disabled binding
checkpoint. Update `.agent/HANDOVER.md` with exact evidence.

The next stage is a fresh read-only hosted baseline under its own plan and
authorization boundary. It must capture the Vercel connected-repository ID and
confirm every other target pin before the missing deployment binding can be
implemented. Provider disablement, Generation 22 arming, execution,
reconciliation and the no-purchase journey remain later separate gates.

## Completion record

Completed locally on 2026-09-22 with every live/native gate still disabled.

- Added the fixed 30-second monotonic executor. It aborts once, waits for the
  operation to settle after cancellation and never returns a late success.
- Corrected the Supabase SDK base to the project root and added the official
  custom-provider client plus exact, broker-only Supabase and Vercel secret
  bindings. Unrelated validated host names no longer create false
  reconciliation after a write.
- Added the supported surface bindings for the four exact Vercel Preview flag
  writes, one exact Edge flag write, runtime Edge proof, immutable readiness,
  alias resolution and deployment reads. Vercel project, team, scope, branch,
  alias and Supabase staging identities are fixed. Responses require exact
  success states, bounded streaming JSON and redacted dependency failures.
- Deployment creation remains unavailable with reason
  `VERCEL_CONNECTED_REPOSITORY_ID_NOT_PINNED`. No live launcher or Generation
  22 package was added.
- Independent review found and the implementation corrected delayed-deadline
  success, unscoped secret-name projection, invented Vercel response fields,
  adapter receipt incompatibility, missing HTTP-status checks, unbounded body
  consumption, raw dependency diagnostics and a generic fetch escape hatch.
  Final executor/provider and surface re-reviews were clean.

Verification after correction:

- focused combined executor/provider/surface/readiness suite: 60/60 passed;
- complete `npm test`: 2,160/2,160 passed, including the live-boundary check;
- typecheck passed;
- lint passed with zero errors and 20 pre-existing warnings;
- production build passed with 153 static pages and the staging readiness route;
- `npm audit --audit-level=high`: zero vulnerabilities; and
- activation manifest regeneration/check and `git diff --check`: passed.

No hosted service, provider, secret, database, deployment, alias, customer
journey, email, checkout, purchase, supplier order or production system was
changed during this stage.
