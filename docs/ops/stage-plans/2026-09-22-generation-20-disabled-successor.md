# Generation 20 disabled successor

## Purpose

This is a local, fully disabled successor package. It exists only to make the
next reviewed activation boundary auditable. It performs no hosted action,
generates no credential material, and leaves native, Keychain, replay, and
policy gates false.

## Fixed identity

| Field | Value |
| --- | --- |
| Package | `tll-staging-generation-20-credentials/v1` |
| Generation | `20` |
| Window ID | `a009f2b4-86df-4701-a8bc-1112597e3c42` |
| Staging project | `qdmvngjwkcsilzmqksme` |
| Production excluded | `wrhgscovsgsudtedbljr` |
| Role/DB predecessor | Generation 19, retired |
| Predecessor window | `51809dd4-bd4b-44c7-8609-7dd8ca063679` |
| Predecessor expiry | `2026-09-21T11:08:34.000Z` |

## Preconditions for any future arming review

1. Re-run secret-free, read-only proof that all five runtime-role markers are
   exactly Generation 19, the predecessor window above, state `retired`, and
   the predecessor expiry above.
2. Re-run the focused package, recovery-pin, manifest, and live-boundary tests.
3. Review an arming-only diff that supplies a new bounded expiry. Phase 1 uses
   an intentionally invalid recovery-expiry sentinel, so recovery cannot be
   accidentally used as a live path. The reviewed value must match both the
   active runtime marker and PostgreSQL `VALID UNTIL`; `infinity` is rejected.
4. Keep the current policy holds false until independent review approves that
   separate arming diff.

## What is included

- Generation 20 credential, transport, database-transport, long-session,
  journal, live-launcher, recovery, retirement-preflight, and test artefacts,
  all copied from the reviewed Gen19 structure but disabled.
- Exact predecessor checks in the credential SQL and entry baseline.
- Recovery-pin coverage extended through Generation 20.
- Manifest and stage-boundary coverage extended through Generation 20.

## Explicit exclusions

- No Keychain access, credential creation, provider configuration, database
  mutation, deployment, checkout, purchase, or production access.
- No Generation 19 replay and no generation-20 arming or live invocation.
- A future supported operator entry must provide a secret-free Gen19 retirement
  evidence path; the launcher refuses an armed start without it.
- No use of this document as an activation instruction.
