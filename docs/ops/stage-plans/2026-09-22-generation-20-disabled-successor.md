# Generation 20 consumed successor record

## Purpose

This package is disarmed after its single live attempt stopped at the read-only
entry baseline. It generated no hosted credential material and performed no
provider or database mutation. Native, Keychain, replay, and policy gates are
false, and this Generation 20 identity may never be re-armed.

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

## Preconditions for a future successor review

1. Re-run secret-free, read-only proof that all five runtime-role markers are
   exactly Generation 19, the predecessor window above, state `retired`, and
   the predecessor expiry above.
2. Re-run the focused package, recovery-pin, manifest, and live-boundary tests.
3. Mint a new generation and window identity. Generation 20 is consumed and
   non-replayable. Its disabled code remains only as an audited record/template.
4. Require the successor entry baseline to use the recovery contract for a
   retired predecessor: exact retired marker, `NOLOGIN`, no password, PostgreSQL
   `VALID UNTIL infinity`, inert ADMIN-only edges, zero sessions, and controls
   disabled. Active credentials still require a finite reviewed expiry.
5. Keep all policy holds false until independent review approves a separate
   successor arming diff.

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
- No Generation 19 replay, no Generation 20 replay, and no Generation 20 re-arming or live invocation.
- A future supported operator entry must provide a secret-free Gen19 retirement
  evidence path; the launcher refuses an armed start without it.
- No use of this document as an activation instruction.
