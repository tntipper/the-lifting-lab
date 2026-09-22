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
