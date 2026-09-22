# Agent handover — The Lifting Lab integration

Updated: 2026-09-22 after the disabled concrete activation-binding stage

## Exact repository state

- Repository: `implementation-integration`
- Branch: `codex/tll-integration`
- Verified binding checkpoint: `cc18fda1241db68561fc46f404b9080904aaa9c5`
- Prior adapter checkpoint: `ec62e32`
- Prior state-machine checkpoint: `c4c2309`
- Generation 21 retirement checkpoint: `9032191`
- Production Supabase `wrhgscovsgsudtedbljr` remains excluded.
- Preserve untracked `implementation-state/` and
  `.agent/gen11-journal-watch.mjs`; neither belongs in a commit.

## Hosted state and safety boundary

- Generation 21 is recovered, consumed and non-replayable. Recovery returned
  `PASS_RETIRED`: five runtime roles are NOLOGIN with no passwords, `VALID UNTIL
  infinity`, zero execution edges/sessions, five ADMIN-only operator edges and
  five disabled controls.
- Generation 21 Vercel branch entries and Supabase Edge secret entries were
  removed and their names read back absent. The secret-free receipt is
  `implementation-state/staging/tll-generation-21-retirement-evidence.json`.
- The existing custom provider predates Generation 21 and was not changed. Its
  last readback is drift-prone: it was enabled, its required `subject` scope was
  blank and its JWKS state was unresolved. Obtain a fresh fully loaded read-only
  baseline before relying on these facts.
- No Generation 22 package exists or is armed. No purchase, checkout, supplier
  order, customer email or production mutation is authorized.

## Completed work units

The disabled state-machine and adapter stages remain complete at `c4c2309` and
`ec62e32`. Their provider rotation, atomic control transaction, ordered surface
activation, fixed staging adapters and Preview-only secret-free readiness route
remain disabled and manifest-pinned.

The disabled concrete binding stage is complete at `cc18fda`:

1. `scripts/staging-bounded-executor.mjs` supplies the fixed 30-second monotonic
   cancellation boundary. It aborts once, waits for the operation to settle and
   cannot return a late success.
2. `scripts/staging-provider-broker-native-binding.mjs` constructs the official
   Supabase client from the project root, proving one exact
   `/auth/v1/admin/custom-providers/...` request. Its Vercel and Supabase ports
   allow only the broker-secret commands and project only that secret's
   presence after validating complete inventories.
3. `scripts/staging-surface-activation-native-binding.mjs` implements the four
   exact Preview flag writes, one exact Edge flag write, Edge runtime proof,
   immutable readiness, alias resolution and Vercel v13 deployment reads. It
   pins project, project ID, team ID, scope, branch, alias and Supabase ref;
   streams JSON through a 64 KiB cap and exposes no generic fetch/CLI escape.
4. The Supabase SDK base URL bug is fixed: the SDK receives the project root so
   it cannot request `/auth/v1/auth/v1`.
5. Deployment creation remains fixed unavailable because the connected Vercel
   repository ID is not pinned. There is still no native launcher or ambient
   credential/process/network lookup.

Independent review found and the implementation corrected delayed-deadline
success, unscoped secret-name projection, invented Vercel response fields,
adapter receipt incompatibility, missing status validation, unbounded response
consumption, raw diagnostics and a generic fetch escape hatch. Final
executor/provider and surface reviews were clean.

## Verification at `cc18fda`

- Focused combined executor/provider/surface/readiness tests: 60/60 passed.
- Complete `npm test`: 2,160/2,160 passed.
- Typecheck passed.
- Lint passed with zero errors and 20 pre-existing warnings.
- Production build passed with 153 static pages and `/api/staging/readiness`.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Live-boundary check: PASS, zero violations.
- Activation manifest regeneration/check and `git diff --check`: passed.
- No hosted service, provider, secret, database, deployment, alias or customer
  journey was accessed or changed during this stage.

## Next coherent stage: fresh read-only hosted baseline

Do not arm Generation 22. Start a new stage plan, verify the repository identity
and rerun only the focused binding/manifest/live-boundary checks needed to
establish the local baseline. Then obtain one fresh, fully loaded read-only
staging baseline that:

1. confirms Supabase staging `qdmvngjwkcsilzmqksme` and excludes production;
2. confirms Vercel project `the-lifting-lab`, project ID
   `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4`, team ID
   `team_gf7cgIkkoeMLtODFDDT5MrW4`, scope `my-lifting-lab-s-projects`, Preview
   branch `codex/tll-integration` and the stable alias;
3. captures the connected Git repository ID from an authenticated read-only
   Vercel project response and records its exact source field/provenance;
4. reads the full custom-provider projection, including enabled state, scopes,
   PKCE, endpoints, JWKS and the exact callback/client identity;
5. proves only the broker-secret name is absent in Vercel Preview and Supabase
   Edge, without reading secret values;
6. probes the current Edge runtime response and immutable readiness surface,
   then records deployment, alias, source commit and flag evidence without a
   protection bypass or mutation; and
7. stops on any target mismatch, malformed/undocumented provider shape,
   unexpected JWKS, non-absent broker destination or ambiguous response.

The baseline stage may use an authenticated read-only launcher only after its
small exact diff is independently reviewed. It must not add provider writes,
secret writes, deployments, alias changes, database queries, credential
generation or Generation 22 arming. After the repository ID is reviewed and
pinned, implement/review deployment creation as a separate disabled unit.
Provider disablement/reconciliation, Generation 22 arming, one bounded window,
reconciliation and the owned-email no-purchase journey remain later distinct
gates.

## Programme work after Stage 3 hosted acceptance

The broader release remains held by `docs/ops/integration-release-candidate.md`:

- hosted unified sign-in/cart/account/orders/logout acceptance;
- disabled inventory migration and separately qualified stock/order workers;
- approved supplier mappings, cost/tax/stock evidence and price automation,
  including retail-price versions, flash sales, affiliate-specific discounts,
  attribution, commission/refund reconciliation and spend controls;
- restorable production backup and release rehearsal;
- formula, label and category evidence before scientific recommendations; and
- consent/email flows, production theme publication and production deployment.

## Authoritative pointers

| Purpose | Path |
|---|---|
| Completed binding stage | `docs/ops/stage-plans/2026-09-22-disabled-concrete-activation-bindings.md` |
| Activation manifest | `config/staging-account-activation-manifest.json` |
| Activation runbook | `docs/ops/staging-account-activation.md` |
| Provider incident | `docs/ops/evidence/2026-09-22-generation-21-provider-readback-incident.md` |
| Execution protocol | `docs/ops/project-stage-execution-protocol.md` |
| Broader release gates | `docs/ops/integration-release-candidate.md` |
| Retail, flash-sale and affiliate requirements | `docs/ops/retail-promotions-affiliate-controls.md` |
