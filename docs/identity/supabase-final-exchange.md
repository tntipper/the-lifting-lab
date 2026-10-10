# Disabled final Supabase PKCE exchange

`lib/identity/supabase-final-exchange.ts` implements the final application PKCE exchange and authoritative session/identity verification. It is a default-disabled Node/server transport primitive with no routes, SDK session storage, cookies, background refresh, provider configuration or database writes. Its successful result is **private provisional material**, not an authenticated browser, reconciled connection or completed login.

The caller must first acknowledge a durable one-use final-exchange claim bound to the original browser transaction, exact configuration, application PKCE and consumed broker reservation. This adapter does not invent an intent receipt or enforce one-use across calls/processes. Calling it again can repeat a non-idempotent upstream operation; timeout, transport, verification and promotion recovery must never blindly retry it.

## Exact request and retained inputs

`createSupabaseFinalExchange` captures immutable server configuration: `enabled` (false by default), the staging `publishableKey`, and a total timeout between 100 and 10,000 milliseconds (default 5,000). A trusted transport and clock injection support offline tests; neither comes from HTTP input. The native implementation accepts only the fixed staging token and user URLs, uses certificate validation and a private HTTPS agent, bounds body/header sizes, and follows no redirects or response cookies.

`exchangeSignIn` accepts the retained `authCode`, `applicationVerifier`, `applicationPkceChallenge` and `reservedSubject`. `exchangeMigration` additionally requires the original verified `originalUserId`; an absent target never falls back to sign-in. The code must be a canonical UUID matching the pinned Auth source's format. The verifier is the original canonical 256-bit base64url value; its SHA256 must match the retained challenge. The reserved subject must be the broker's canonical `tllb_` identifier. Extra request fields, such as a caller-selected provider, owner or verification flag, are rejected before dispatch.

Only one `POST https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/token?grant_type=pkce` is sent, with JSON `{auth_code, code_verifier}` and the publishable-key header. It sends no current browser bearer or cookies. The pinned [`PKCE` handler](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/token.go#L214) verifies the application PKCE, issues a session and removes flow state within a transaction; it also includes provider tokens in the response. The pinned [flow-state model](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/models/flow_state.go#L105) generates the UUID code. These are upstream source contracts, not evidence of this tenant's running Auth version.

## One authoritative user response

The token response's user, email and metadata are never identity authority. After bounded token-field validation, the adapter invokes the unchanged `createStagingSupabaseSessionReader` with a request-local accessor for the newly returned access token. The reader performs its ordinary exact-token, signed/current-session checks through the fixed authenticated `GET /auth/v1/user`. A transport wrapper privately captures the same response bytes for identity checks; a second user read or decoded-JWT fallback is not used.

The [pinned identity model](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/models/identity.go#L14) has these JSON semantics:

| Field | Meaning and check |
| --- | --- |
| `id` | Stable provider subject. Require exact equality with the reserved broker subject. |
| `identity_id` | Identity-row UUID. Validate it and reject duplicate row UUIDs. It is not the provider subject. |
| `provider` | Require exactly one identity for `custom:tll-staging-subject-broker-v1`, the same candidate provider pinned by admission. |
| `user_id` | Must equal the user UUID proven by the authenticated reader. |
| `identity_data`, email, user/app metadata | Ignored as authority and omitted from output. |

The identity list is bounded to 64 rows. All returned rows require a valid row UUID, provider/id strings and the same owner UUID; multiple or conflicting broker identities remain held. Other correctly owned legacy identities are allowed. Migration additionally requires the final user UUID to equal the retained original UUID. Its new session ID may differ from the original migration session. For new sign-in only the final authoritative response supplies the UUID; the adapter does not infer one from email or metadata.

Only after the reader verifies the exact token does the adapter inspect its authentication-method claims. The pinned [external admission](https://github.com/supabase/auth/blob/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/api/external.go#L113) creates an OAuth flow, and final PKCE issuance uses that stored authentication method. Require a timestamped OAuth method equal to the reader's latest qualifying authentication time and less than five minutes old. Older password and newer MFA/refresh entries are permitted; a newer password must not substitute for OAuth. Duplicate methods, invalid timestamps and anonymous/missing/revoked sessions are rejected by the reader. The token response's finite `expires_at` must exactly equal the verified JWT expiry, with token lifetimes bounded to 24 hours.

## Private result and failure boundary

Successful output has `kind: 'private_provisional'`, a frozen `session` containing only Supabase access/refresh tokens, bearer type and expiry in milliseconds, the reader's frozen session proof, and a minimal frozen broker identity. Whitelist projection removes `provider_token`, `provider_refresh_token`, raw user/metadata, response headers/cookies and unrecognized response fields. The Supabase access/refresh tokens remain credentials: this result must be encrypted under the provisional transaction's purpose/AAD and must never be serialized to a browser, log or public table.

One monotonic total deadline covers POST, parsing, the authenticated GET and final checks. The reader receives only the remaining budget, and both requests share cancellation. A late POST response cannot initiate user verification after the deadline. There is no transparent retry, automatic refresh or compensating logout.

`SUPABASE_FINAL_EXCHANGE_HELD` exposes only `not_attempted` or `uncertain`, with a fixed message and no underlying cause. Every failure after entering the POST path—including a rejection, malformed response, lost response, invalid identity, revoked session or exceeded deadline—is uncertain and returns no tokens. Supabase may already have created a session. The caller must retain the held durable claim for authoritative recovery; this module neither proves cleanup of that session nor authorizes another exchange.

## Remaining release gates and local evidence

After a successful result, reconciliation must still prove and commit the exact broker reservation, provisional Shopify receipt/vault and final Supabase UUID binding. Only an acknowledged reconciliation may release sanitized SSR cookies. Durable encrypted intent storage, owner/browser cancellation, unknown exchange recovery, authoritative promotion, cookie delivery recovery, full logout and real provider acceptance remain separate work. No route or provider may be enabled solely because this adapter passes local tests.

`tests/supabase-final-exchange.test.mjs` checks the actual adapter and unchanged reader together. A cryptographic synthetic `/user` authority distinguishes valid, forged and revoked sessions; tests cover exact PKCE binding, migration UUID continuity, identity JSON semantics, metadata substitution, duplicate/mixed/timestamped AMR, token sanitization, HTTP bounds/redirects, clock and total-deadline failures, and concurrent isolation. The native HTTPS branch is also exercised through an offline boundary probe. These tests open no sockets and do not establish hosted Auth/provider interoperability, durable storage or completed login.
