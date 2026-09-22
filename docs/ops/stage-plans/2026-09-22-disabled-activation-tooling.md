# Disabled staging activation tooling

## Outcome and acceptance

Build the missing fail-closed tools needed to activate the already implemented
staging account and cart surfaces without opening another credential window.
This stage is complete only when repository code can:

1. rotate one broker client secret through the fixed Vercel Preview, Supabase
   Edge and existing Supabase custom-provider boundaries with an explicit
   two-phase reconciliation result;
2. enable all five database controls atomically in one fixed transaction and
   return an exact redacted receipt;
3. freeze and later sequence Edge, private server and public build-time flags
   while binding each state to an immutable deployment and stable-alias proof;
4. keep secrets out of argv, results, errors, journals and committed files;
5. fail closed before any side effect when the staging identity, provider,
   branch, alias, source commit, manifest hash or active runtime contract differs;
6. pass focused tests, the complete suite, typecheck, lint with no new errors,
   generated-artifact checks and the live-boundary check; and
7. receive an independent security review while every native gate remains
   disabled.

## Exclusions

This stage performs no hosted mutation, provider update, secret creation,
credential generation, database query, deployment, sign-in, customer email,
checkout, purchase, supplier order or production change. Production Supabase
`wrhgscovsgsudtedbljr` remains excluded. Generation 21 is consumed and cannot
be replayed. No Generation 22 package or arming diff belongs in this stage.

## Starting state

- Repository branch `codex/tll-integration` is at or after `9032191`.
- Generation 21 recovery returned `PASS_RETIRED`; all five runtime identities
  are inert and all five controls are disabled.
- Generation 21 Vercel branch configuration entries and Supabase Edge secret
  entries were removed and their names read back absent.
- The pre-existing custom provider remains enabled in Supabase configuration,
  retains its older write-only secret, has a blank required `subject` scope and
  has an unresolved JWKS URI.
- The Edge broker and application feature gates remain disabled.

## Planned repository changes

- Add a pure injected-port broker rotation state machine and focused tests.
- Add a pure generator/validator for the atomic five-control transaction and
  focused tests. A later generation wrapper must pin its generation, window and
  expiry; this stage exposes no native database transport.
- Add a separate surface activation transport with injected Vercel, Supabase,
  deployment and HTTPS ports plus focused tests. It exposes no live launcher.
- Update the activation manifest, runbook, incident prevention checklist and
  `.agent/HANDOVER.md` only after the new contracts are stable.

## Preconditions and stop conditions

The implementation must stop for redesign if source inspection shows the three
provider destinations can be mistaken for atomic, if initial control activation
cannot be one transaction, if cart requires an unreviewed authority path, if a
flag cannot be tied to a fresh deployment, or if a test needs a real credential
or hosted call.

The provider state machine must clean staged values only when failure is proven
to occur before provider update. Any failure or lost acknowledgement after the
provider update begins returns `RECONCILIATION_REQUIRED` and retains the staged
destinations. It must never guess or roll back to an unavailable old secret.

The control transaction must lock and update customer, cart, broker,
provisional and bridge controls in dependency order. It must temporarily
acquire only the four non-cart owner `SET` edges and restore them to ADMIN-only
before commit. Cart control is deliberately update-denied to `tll_cart_owner`;
the transaction must instead prove the reviewed staging operator owns the cart
control table, that RLS is enabled but not forced, and update it directly as
that owner. It must not call the cyclic broker/provisional/bridge enable
wrappers.

The surface tool must freeze Edge first and then Vercel flags. It must treat
Vercel environment-name readback as configuration evidence only: build-time
public flags require a fresh immutable deployment, exact source commit,
stable-alias resolution and runtime-state proof.

## Verification and review

Each tool is a separate work unit: implement, run its focused tests, correct,
then independently review before integration. After all three units, run the
full repository gates. Any future hosted execution requires a new stage plan,
fresh read-only baseline, exact arming diff, independent review, one bounded
attempt, reconciliation and disarm under
`docs/ops/project-stage-execution-protocol.md`.

## Completion record

Completed in the repository while every native gate remained disabled. The
provider rotation now requires an exact frozen, target-bound preflight and
preserves reconciliation across replay and concurrent journal races. The five
database controls are enabled by one transaction with an actual PostgreSQL 17
fixture proving privilege-drift rejection, atomic rollback and restoration of
ADMIN-only owner edges. The surface state machine requires a distinct immutable
Preview build for both held and enabled states, exact alias/TLS resolution and
runtime proof of Edge, private and public flags. An uncertain enabled deployment
remains `RECONCILIATION_REQUIRED` even after a held recovery build verifies.

Independent security reviews passed all three units after their findings were
corrected. This completes the disabled tooling stage only. Native adapters,
fresh hosted baselines and Generation 22 arming remain a separate reviewed
stage; none were created or executed here.
