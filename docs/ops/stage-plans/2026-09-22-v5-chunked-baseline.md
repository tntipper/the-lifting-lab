# Staging database v5 chunked-response correction

## Outcome sought

Accept standard `Transfer-Encoding: chunked` on the Supabase Management query
response and validate the exact one-row v2 retirement receipt. The v4
diagnostic proved HTTP 201 plus a transfer-encoding header, but did not record
its value. This stage tests the narrow `chunked` hypothesis; it must not
accept any other transfer coding, content compression, malformed content
length, oversize body, redirect, or receipt drift. The body remains streamed
with a 1 MiB cap and abort/cancellation settlement.

## Scope and sequence

Modify the disabled v3/v4 diagnostic reader and the full hosted Supabase
binding's matching response rule. Add focused regression tests for standard
chunked success and unsupported coding rejection, plus the existing failure
paths. Use a fresh exclusive mode-0600 v5 journal at
`../implementation-state/staging/tll-hosted-baseline-v5-db-chunked.json`.
Regenerate only manifests whose source hashes change and inspect their exact
diffs. Run focused and full disabled checks. Independently review the disabled
package and then the one-line arming diff. Verify exact staging project,
unchanged v2 query hash, Keychain selector, and absent v5 journal. Invoke the
launcher directly **once**, disarm, and reconcile. If the response is not
chunked or the receipt fails, document that evidence and stop until a distinct
cause is corrected; never replay v2/v3/v4/v5 journals.

No production, Vercel, Shopify, customer contact, database write, purchase,
or public deployment is in scope. A validated PASS clears only the staging
database baseline gate; the full hosted observer remains a separate stage.

## Outcome, 22 September 20:43 UTC

The disabled correction `38de3fb` passed 2,250 tests and independent review.
The exact one-line arming diff `893b40f` was independently approved and
invoked once. The response passed exact receipt validation. The fresh
mode-0600 v5 journal is terminal PASS, run ID
`1a094fad-24b1-4c1d-80f4-08fd954a24a7`, 20:43:09.693–20:43:10.155 UTC,
target `qdmvngjwkcsilzmqksme`, no reason codes, receipt hash
`04ee2fe8a104a319c44ababed0faed0737b6d983fb724567da6b50c4f5ea0670`.
The launcher gate was immediately restored to false; full observer and
Keychain-helper gates remain false. Live-boundary and hosted-manifest checks
pass after disarm. The v5 journal is consumed and must not be replayed.

An independent local PostgreSQL JSONB canonicalization of the SQL's literal
receipt produced the same hash. A naive JavaScript hash of the pre-JSONB
literal differs because PostgreSQL JSONB reorders object keys; it is not a
receipt mismatch. This verification reads the local fixture only and does not
make another hosted request.

The technical cause of v2's opaque failure was the blanket transfer-encoding
rejection in the hosted Supabase binding. v3 showed HTTP 201 plus framing
rejection; v4 isolated transfer encoding; v5's narrow `chunked` acceptance
reached and validated the exact receipt. The process cause was insufficient
HTTP/framing classification in the first rehearsal, which forced extra
one-shot diagnostic windows. The preventive controls are finite error codes,
a fresh exclusive journal per attempt, case-insensitive `chunked` acceptance
only, bounded streaming, and tests for accepted/rejected framing. The next
stage is the separate full hosted observer with Supabase, provider, Vercel,
and surface reads; database PASS alone does not establish those states.
