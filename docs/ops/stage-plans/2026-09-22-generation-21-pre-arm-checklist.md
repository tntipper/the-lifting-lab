# Generation 21 pre-arm checklist

`PREDECESSOR_RETIREMENT_EVIDENCE_REQUIRED`

This is a future independent-review gate. It does not authorise a database or
provider change, checkout, purchase, deployment, or live invocation.

## Exact predecessor

- Generation: `19`
- Package: `tll-staging-generation-19-credentials/v1`
- Window: `51809dd4-bd4b-44c7-8609-7dd8ca063679`
- Marker expiry: `2026-09-21T11:08:34.000Z`
- Marker state: `retired`
- Retired role `VALID UNTIL`: `infinity`

## Required evidence and review

- [ ] Fresh secret-free read-only evidence proves all five exact parsed markers,
  NOLOGIN/no-password state, infinity expiry, the five reviewed ADMIN-only
  operator edges only, no runtime sessions, and disabled controls.
- [ ] The evidence record uses `PASS_RETIRED_BASELINE` and exact aggregate counts:
  `runtimeRoles=5`, `markerExact=5`, `loginRoles=0`, `passwordsConfigured=0`,
  `validUntilInfinity=5`, `operatorEdges=5`, `executionEdges=0`,
  `runtimeSessions=0`, `controlRows=5`, and `controlsEnabled=0` for staging project
  `qdmvngjwkcsilzmqksme`.
- [ ] `node scripts/staging-generation-21-pre-arm-gate.mjs` is exercised only
  with evidence conforming to its public schema while native gates remain false.
- [ ] Recovery-pin coverage includes Gen21; the manifest and live-boundary
  checks remain green with Gen10–21 replay holds and Gen11–21 armed holds false.
- [ ] An independent reviewer approves a minimal arming-only diff with one
  finite expiry. It must not alter lineage, targets, provider values, policy
  holds, or ordinary-test boundaries.
- [ ] Hosted/provider review and a later owned-email no-purchase journey remain
  separate stages and stop before checkout.

## Phase 1 invariant

`NATIVE_GENERATION_21_TRANSPORT_ENABLED`,
`NATIVE_GENERATION_21_DATABASE_TRANSPORT_ENABLED`, and
`APPROVED_NATIVE_READ` remain false. Generation 21 has not run.
