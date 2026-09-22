# Agent handover — The Lifting Lab integration

Updated: 2026-09-22 after the disabled native-adapter stage

## Exact repository state

- Repository: `implementation-integration`
- Branch: `codex/tll-integration`
- Verified adapter checkpoint: `ec62e32` (`Add disabled staging activation adapters`)
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
  write-only broker secret is older, its required `subject` scope was blank at
  the last readback, and its JWKS state was unresolved. Edge and application
  gates are disabled. Obtain a fresh fully loaded read-only baseline before
  relying on these drift-prone facts.
- No Generation 22 package exists or is armed. No purchase, checkout, supplier
  order, customer email or production mutation is authorized.

## Completed work units

The disabled activation state-machine stage is complete at `c4c2309`:

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
   record pin these contracts.

The disabled native-adapter stage is complete at `ec62e32`:

1. `scripts/staging-provider-broker-native-adapter.mjs` uses the official
   Supabase Auth Admin custom-provider contract, separates actual drifted-state
   inspection from strict post-update validation, verifies provider disablement
   with a fresh final read and keeps staged host values after update uncertainty.
2. `scripts/staging-database-native-adapter.mjs` owns the exact staging
   Management API request and generates the only permitted control transaction
   internally. There is no generic SQL, project or endpoint input.
3. `scripts/staging-surface-activation-native-adapter.mjs` binds Edge, Vercel
   Preview, deployment, alias, TLS and runtime evidence to the fixed target.
   Every external operation requires the reviewed injected settled-executor
   contract and an AbortSignal.
4. `/api/staging/readiness` is Preview-only and secret-free. It proves the
   immutable deployment plus private runtime flags and the public environment,
   customer and cart values compiled into that build. Edge is proved separately.
5. Independent review found and the implementation corrected blocked provider
   repair, stale disabled receipts, unbounded adapter calls, opposite Edge
   acknowledgements, false-positive tests, process-local deployment evidence,
   malformed TLS acceptance and runtime/build-time flag confusion.

Every native-enable constant remains false. There is no live launcher, no
concrete wall-clock executor and no Generation 22 package.

Independent security reviews passed the final provider, control and surface
state machines. They did not qualify native adapters or hosted execution.

## Verification at `ec62e32`

- Focused adapter, manifest and state-machine tests: 58/58 passed; final combined
  adapter/state-machine subset: 50/50 passed before manifest integration.
- Complete `npm test`: 2,137/2,137 passed.
- Typecheck passed; lint had zero errors and 20 pre-existing warnings.
- Production build passed with 153 static pages.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Live-boundary check: PASS, zero violations.
- Activation manifest `--check` and `git diff --check`: passed.
- A transient typecheck failure came from iCloud-generated duplicate files under
  disposable `.next/types`; deleting `.next` and regenerating from source passed.

## Next coherent stage: concrete executor/provider bindings and fresh baseline

Do not arm Generation 22 first. Write a new stage plan and complete these units
while runtime credentials remain retired:

1. Implement and independently review the concrete wall-clock executor and the
   exact provider bindings injected into the provider/surface adapters. Prove
   timeout cancellation has settled before compensating writes and redact all
   diagnostics. Keep every gate false and add no general shell/API escape.
2. Obtain a fresh read-only staging baseline for the fully loaded provider,
   Vercel Preview project/scope/branch, Supabase Edge, destination-name absence,
   immutable deployment, alias and readiness surfaces. Treat prior evidence as
   drift-prone and stop on target or provider mismatch.
3. Run the separate provider-disable/reconciliation prerequisite if the fresh
   baseline remains enabled. A configured JWKS is a hard stop; blank scope is
   repairable only inside the later exact rotation.
4. Prepare and independently review a separate Generation 22 arming diff. Do
   not combine arming with execution.
5. Execute at most one bounded window, reconcile/disarm, then run the owned-email
   no-purchase journey as separate gates under
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
