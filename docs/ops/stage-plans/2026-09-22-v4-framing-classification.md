# Staging database v4 framing classification

The consumed v3 diagnostic returned HTTP 201 but rejected its response
framing before reading the receipt. The exact offending header is unknown.
This one-shot staging read-only successor must classify only whether the
response has unsupported content encoding, transfer encoding, or invalid or
oversized content length. It must not expose header values, body contents,
credentials, or SQL in the journal. The exact v2 SQL, `read_only:true`, target,
receipt validator, bounded stream reader, and abort cleanup remain unchanged.

Use a fresh exclusive mode-0600 journal at
`../implementation-state/staging/tll-hosted-baseline-v4-db-framing.json`.
Preserve the v2 and v3 journals. Commit/test while disabled, independently
review disabled code and the exact one-line arming diff, check target/query
hash/Keychain selector/journal absence, invoke once, disarm and reconcile.
No ordinary tests while armed. Any failure/uncertainty stops the loop until a
new cause and preventive correction are documented. No production, Vercel,
Shopify, purchase, customer contact, or database write is in scope.

## Outcome

The disabled package `470c080` passed 2,248 tests and independent review.
The exact one-line arming diff `04fc22e` was independently approved and
invoked once. The exclusive mode-0600 v4 journal is terminal HOLD, run ID
`78eb8237-9416-4e6f-a9e4-f8e3ab521834`, 20:40:51.397–20:40:51.824 UTC,
with `HTTP_201` and `RESPONSE_TRANSFER_ENCODING`. The gate was immediately
restored to false and the live-boundary check passes. This journal is consumed.

The direct local cause is the response guard's blanket rejection of any
transfer-encoding header after Supabase returned its documented HTTP 201.
The code did not inspect the header value, so the actual transfer coding is
not recorded. A narrow successor may permit only standard `chunked` transfer
coding, which the Fetch implementation already decodes, while retaining the
bounded body reader and rejection of other codings. It must apply the same
correction to the full hosted observer binding so that a later passing DB
diagnostic cannot conceal a full-observer regression. Tests must prove valid
chunked framing reaches exact receipt validation and unsupported framing
remains held. If the actual value differs, stop with a new classification;
do not broaden acceptance speculatively.
