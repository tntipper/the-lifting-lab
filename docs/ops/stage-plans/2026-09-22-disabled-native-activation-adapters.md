# Disabled native activation-adapter preparation

## Outcome and acceptance

Implement the exact native adapter boundary required by the already reviewed
provider, control and surface state machines while every live gate remains
disabled. This stage is complete only when the repository can construct and
validate the real Supabase/Vercel requests without executing them in ordinary
tests, and when:

1. every adapter is pinned to Supabase staging `qdmvngjwkcsilzmqksme`, Vercel
   project `the-lifting-lab`, scope `my-lifting-lab-s-projects`, Preview branch
   `codex/tll-integration` and the reviewed stable alias;
2. production `wrhgscovsgsudtedbljr`, caller-supplied projects, branches, URLs,
   SQL and provider identifiers are rejected before process or network access;
3. provider inspection returns the complete redacted frozen-state contract and
   provider disablement/reconciliation is a separate reviewed prerequisite to
   secret rotation;
4. broker material is accepted only as a Buffer, travels through stdin or a
   private descriptor, and never appears in argv, environment, results, errors,
   journals or committed files;
5. the database adapter accepts only the one generated control transaction for
   its exact future context and returns only the fixed Management API envelope;
6. surface adapters bind every flag, deployment, alias, TLS and runtime receipt
   to the exact target and reject configuration-only evidence as runtime proof;
7. all native-enable constants remain false, no live launcher is added, and the
   live-boundary check passes; and
8. focused tests, full tests, typecheck, lint, build, generated-artifact checks
   and independent security review pass.

## Exclusions

This stage performs no hosted read or mutation, provider change, credential
generation, database query, deployment, alias change, browser sign-in, customer
email, checkout, purchase, supplier order or production change. It does not
create or arm Generation 22. It does not change Shopify, Supabase, Vercel,
Keychain or local secret files.

## Authoritative starting state

- Branch `codex/tll-integration` starts at or after `1612532`.
- Generation 21 is retired, recovered and non-replayable.
- All runtime identities are inert and all five controls are disabled.
- The injected state machines at `c4c2309` passed independent review.
- The last provider readback is drift-prone evidence only: its stored secret
  predates Generation 21, `subject` was blank and JWKS remained unresolved.
- `config/project-stage-gate-policy.json` keeps all native gates disabled and
  forbids launchers in ordinary transport modules.

## Planned repository surface

- Add one target/readback adapter module and focused tests for the exact frozen
  Supabase/Vercel/provider baseline.
- Add a provider adapter and tests that implement the injected rotation ports
  plus a separate provider-disable/reconciliation contract.
- Add a database adapter and tests that will post only the exact generated
  control transaction.
- Add a surface adapter and tests for exact flag, deployment, alias, TLS and
  runtime receipts.
- Reuse reviewed bounded runners and parsers where their contracts match;
  extract shared helpers only when tests prove behavior is unchanged.
- Update the activation manifest, runbook and `.agent/HANDOVER.md` only after
  the adapter contracts are stable and independently reviewed.

## Pre-implementation evidence

Source inspection must establish before adapter code is accepted:

- which existing Supabase Management API/CLI boundary returns the complete
  provider projection and whether provider disablement has a stable exact API;
- how Vercel configuration writes are scoped to Preview plus Git branch;
- how a fresh immutable deployment, source commit, creation time and stable
  alias target are observed independently;
- which deployed route can return the fixed, secret-free runtime public/private
  readiness contract; and
- how the database Management API preserves one-request semantics and returns
  the receipt after commit.

If a stable exact provider API or runtime proof is unavailable, stop and record
the missing boundary rather than substitute browser scraping, a generic shell
escape or configuration-name readback.

## Failure modes and preventive controls

- A target mismatch, unexpected response key, duplicate record, redirect,
  timeout, truncated output or parse ambiguity returns a fixed unavailable or
  reconciliation result without retry.
- Process output is bounded and zeroed. Diagnostic classification uses fixed
  codes and never returns raw provider output.
- Secret-bearing operations use exclusive one-use journals at the orchestration
  layer; adapters do not add their own replay path.
- Provider disablement must be proven before secret generation. A lost provider
  mutation acknowledgement requires read-only reconciliation.
- Deployment dispatch uncertainty remains reconciliation-required even after a
  held deployment is later verified.
- Ordinary tests use injected process/HTTP/TLS runners and must fail if a real
  child process, socket, Keychain reader or live launcher is reached.

## Verification and closeout

Review each adapter as a separate work unit: implement, focused test, correct,
then independent security review. After integration, run the full repository
gates and `npm run check:live-boundaries`. Commit and push only the still-disabled
adapter checkpoint. The next stage begins with a fresh read-only hosted baseline
and a separately planned Generation 22 arming diff; it must not be folded into
this work unit.

## Completion record

Completed locally on 2026-09-22 with all native-enable constants false and no
hosted access. The accepted boundary consists of:

- an official Supabase Auth Admin provider adapter that can inspect and disable
  the documented drifted provider, repairs only after the frozen gate, requires
  strict post-update readback and retains staged destinations after uncertainty;
- a closed one-request Supabase Management API control adapter that generates
  the only permitted transaction internally and accepts only its exact receipt;
- target-bound surface ports for Edge, Vercel Preview flags, immutable
  deployments, alias, TLS and runtime readiness; and
- a Preview-only readiness contract that proves private runtime flags and the
  public environment/customer/cart values compiled into the deployment.

Independent review found and the implementation corrected provider drift that
blocked repair, stale provider-disable receipts, unbounded injected operations,
opposite Edge acknowledgements, false-positive state-machine tests, process-
local deployment evidence, malformed TLS acceptance and runtime values being
mistaken for compiled public values. Focused adapter/state-machine tests cover
the corrected cases.

No launcher or actual wall-clock executor is included. Provider and surface
operations require an injected executor that supplies an AbortSignal and does
not return cancellation until the operation has settled. A concrete executor
and each hosted provider binding require a separate review before arming.
Generation 22 remains absent and unarmed.
