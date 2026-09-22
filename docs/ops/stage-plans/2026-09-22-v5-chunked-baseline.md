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
