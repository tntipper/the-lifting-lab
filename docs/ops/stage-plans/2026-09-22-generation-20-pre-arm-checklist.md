# Generation 20 pre-arm checklist

`PREDECESSOR_RETIREMENT_EVIDENCE_REQUIRED`

This checklist is a gate for a future independently reviewed arming diff. It
does not authorise an activation, provider change, database change, checkout,
or purchase.

## Exact predecessor contract

- Generation: `19`
- Package: `tll-staging-generation-19-credentials/v1`
- Window: `51809dd4-bd4b-44c7-8609-7dd8ca063679`
- ExpiresAt: `2026-09-21T11:08:34.000Z`
- Required marker state: `retired`

## Before an arming review

- [ ] Obtain fresh, secret-free read-only evidence for the exact predecessor
  contract above across all five runtime roles.
- [ ] Confirm `node scripts/staging-generation-20-pre-arm-gate.mjs` succeeds
  only when passed that evidence and all native gates remain false.
- [ ] The only supported live entry must receive the same repository-relative
  evidence path: `node scripts/staging-generation-20-run-live-once.mjs
  --retirement-evidence implementation-state/staging/<secret-free-proof>.json`.
- [ ] Run recovery-pin coverage through Generation 20 and the live-boundary
  check with Gen10–20 replay holds and Gen11–20 armed holds false.
- [ ] Review a minimal arming-only diff. It must replace the Phase-1 recovery
  expiry sentinel and no predecessor, provider, policy, or production target.
- [ ] Reconfirm the bounded no-purchase journey and stop before checkout.

## Phase 1 invariant

`NATIVE_GENERATION_20_TRANSPORT_ENABLED`,
`NATIVE_GENERATION_20_DATABASE_TRANSPORT_ENABLED`, and the Keychain read gate
remain false. Generation 20 has not run.
