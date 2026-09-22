# Agent handover — The Lifting Lab integration

Updated: 2026-09-22 after the disabled activation-tooling stage

## Exact repository state

- Repository: `implementation-integration`
- Branch: `codex/tll-integration`
- Verified tooling checkpoint: `c4c2309` (`Add reviewed staging activation state machines`)
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
  write-only broker secret is older, its required `subject` scope was blank at
  the last readback, and its JWKS state was unresolved. Edge and application
  gates are disabled. Obtain a fresh fully loaded read-only baseline before
  relying on these drift-prone facts.
- No Generation 22 package exists or is armed. No purchase, checkout, supplier
  order, customer email or production mutation is authorized.

## Completed work unit

The disabled activation stage is complete at `c4c2309`:

1. `scripts/staging-provider-broker-rotation.mjs` rotates one in-memory value
   through exact target-bound injected ports. It requires frozen provider,
   Edge, private and public state plus absent secret names before generation.
   Provider-update uncertainty retains destinations and requires reconciliation.
2. `scripts/staging-control-activation.mjs` builds one fixed transaction that
   validates staging/runtime/authority state, enables all five controls
   atomically, restores temporary owner SET edges to ADMIN-only and returns one
   redacted receipt. Ambiguous acknowledgement requires reconciliation.
3. `scripts/staging-surface-activation-transport.mjs` pins the Supabase ref,
   Vercel project/scope, Preview branch and stable alias. Held and enabled states
   require distinct newly built immutable deployments, exact source/manifest
   pins, alias/TLS proof and runtime proof of Edge, private and public flags.
   Uncertain enabled-build dispatch remains reconciliation-required even after
   a held recovery build verifies.
4. The manifest, runbook, Generation 21 incident learning and stage completion
   record pin these contracts. Native adapters remain absent and every live
   gate remains disabled.

Independent security reviews passed the final provider, control and surface
state machines. They did not qualify native adapters or hosted execution.

## Verification at `c4c2309`

- Focused activation tests: 25/25 passed (provider 10, controls 6, surfaces 9).
- Actual PostgreSQL 17 fixture passed privilege-drift rejection, forced partial
  rollback, atomic five-control enablement and ADMIN-only edge restoration.
- Complete `npm test`: 2,112/2,112 passed.
- Typecheck passed; lint had zero errors and 20 pre-existing warnings.
- Production build passed with 153 static pages.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Live-boundary check: PASS, zero violations.
- Activation manifest `--check` and `git diff --check`: passed.

## Next coherent stage: native adapter preparation, still disabled

Do not arm Generation 22 first. Write a new stage plan and complete these units
while runtime credentials remain retired:

1. Build read-only target adapters returning exact redacted evidence for the
   fully loaded provider, Vercel Preview project/scope/branch, Supabase Edge,
   secret-name presence, immutable deployment, alias and runtime readiness.
2. Add a reviewed provider-freeze/reconciliation step because rotation requires
   the provider disabled and destination names absent before generation.
3. Implement exact native adapters for all three injected contracts. Keep their
   native enable constants false, accept no caller target/SQL/URL, keep secret
   material off argv/files/results and test command/API construction with fakes.
4. Obtain independent security review and run the full repository gates before
   committing the disabled adapter stage.
5. Only then obtain a fresh read-only hosted baseline and prepare a separate
   Generation 22 arming diff. Arming, bounded execution, reconciliation/disarm
   and the owned-email no-purchase journey are separate gates under
   `docs/ops/project-stage-execution-protocol.md`.

## Programme work after Stage 3 hosted acceptance

The broader release remains held by `docs/ops/integration-release-candidate.md`:

- hosted unified sign-in/cart/account/orders/logout acceptance;
- disabled inventory migration and separately qualified stock/order workers;
- approved supplier mappings, cost/tax/stock evidence and price automation,
  including retail-price versions, flash sales, affiliate-specific discount
  codes, attribution, commission/refund reconciliation and spend controls in
  `docs/ops/retail-promotions-affiliate-controls.md`;
- restorable production backup and release rehearsal;
- formula, label and category evidence before scientific recommendations; and
- consent/email flows, production theme publication and production deployment.

## Authoritative pointers

| Purpose | Path |
|---|---|
| Completed stage | `docs/ops/stage-plans/2026-09-22-disabled-activation-tooling.md` |
| Provider incident | `docs/ops/evidence/2026-09-22-generation-21-provider-readback-incident.md` |
| Activation manifest | `config/staging-account-activation-manifest.json` |
| Activation runbook | `docs/ops/staging-account-activation.md` |
| Execution protocol | `docs/ops/project-stage-execution-protocol.md` |
| Broader release gates | `docs/ops/integration-release-candidate.md` |
| Retail, flash-sale and affiliate requirements | `docs/ops/retail-promotions-affiliate-controls.md` |
