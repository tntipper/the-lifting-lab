# Generation 21 disabled successor

> Historical disabled-base record. The reviewed one-window arming state is
> documented separately in [Generation 21 one-window arming diff](2026-09-22-generation-21-arming-diff.md).
> This document does not authorise another action.

## Purpose

Generation 21 is a new, fully disabled successor package. It carries the
corrected retired-role contract into a future, separately reviewed activation
window. It has never been invoked, creates no credentials, and has no provider
or database effect.

## Fixed identity and lineage

| Field | Value |
| --- | --- |
| Package | `tll-staging-generation-21-credentials/v1` |
| Generation | `21` |
| Window ID | `a5511645-77af-4fc9-9e4c-f5c8a474d5fa` |
| Staging project | `qdmvngjwkcsilzmqksme` |
| Production excluded | `wrhgscovsgsudtedbljr` |
| Role/DB predecessor | Generation 19, retired |
| Marker window and historical expiry | `51809dd4-bd4b-44c7-8609-7dd8ca063679`, `2026-09-21T11:08:34.000Z` |
| Consumed intervening attempt | Generation 20, `a009f2b4-86df-4701-a8bc-1112597e3c42`, stopped at entry preflight before dispatch |

Generation 20 remains permanently consumed and non-replayable. It is attempt
lineage only: its failed preflight never changed the Generation 19 role state,
so Generation 21 retains Generation 19 as its role/database predecessor.

## Entry invariant

Before a future arming review, a secret-free read-only baseline must prove all
five runtime identities have the exact parsed Generation 19 `retired` marker
above; are `NOLOGIN`; have no `pg_authid` password; retain PostgreSQL `VALID
UNTIL infinity`; have exactly the five reviewed runtime-to-current operator
ADMIN-only, non-INHERIT, non-SET edges and no other runtime memberships; have
zero runtime sessions; and have all five controls disabled. The marker retains
the historical active-window expiry, which must never be compared to the
retired role's `VALID UNTIL infinity` value.

## Phase 1 holds

`ACTIVE_WINDOW_EXPIRES_AT` is the reviewed-arm sentinel. Native transport,
native database transport, Keychain reads, replay, and policy gates are all
false. No production target, credential value, provider configuration,
database mutation, deployment, checkout, or purchase is included.

## Future independent arming gate

1. Re-run the exact secret-free baseline and store only evidence permitted by
   the pre-arm schema.
2. Re-run focused Gen21, recovery-pin, manifest, and live-boundary checks.
3. Independently review an arming-only diff that supplies one finite expiry and
   changes no predecessor, target, provider, policy hold, or test boundary.
4. Review the immutable Preview and provider configuration separately before
   any supported live entry. A later no-purchase journey must stop before
   checkout.

This document is a plan and constraint record; it does not authorise arming or
activation.
