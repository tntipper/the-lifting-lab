# Staging generation-6 activation

This runbook activates only Supabase project `qdmvngjwkcsilzmqksme`, Shopify development store `tll-integration-staging.myshopify.com`, and the Vercel preview project recorded in `config/staging-account-activation-manifest.json`. Production project `wrhgscovsgsudtedbljr`, purchases, order submission and customer email are excluded.

The fixed runtime window is generation `6`, window ID `83888906-23fa-4653-a886-fe2733ed76a0`. Choose one expiry no more than 60 minutes after database credential installation. Every runtime role must use the same expiry and exact active marker. Never place a password, provider secret, vault key, access token or bypass key in Git, chat, logs, evidence files or command output.

## Entry gate

1. Require clean Git state at the reviewed activation commit and record the commit and activation-manifest SHA-256.
2. Require the hosted recovery-readiness PASS receipt for 15 exact migrations, 16 recovery relations, 15 ADMIN-only operator edges, five disabled controls and inert generation-5 roles.
3. Require the generated recovery and post-commit artifacts to match their manifest pins. Keep them available before opening the credential window.
4. Read back the exact staging project/store/project IDs. Stop on any mismatch.

## Activation sequence

1. **Deploy Edge disabled.** Deploy `tll-broker-token` and `tll-broker-userinfo` from the pinned commit with `verify_jwt=false` and `TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED` absent or `false`. Both endpoints must return the fixed `503 {"error":"temporarily_unavailable"}` response with `no-store`. Record immutable deployment identifiers and source hashes.
2. **Stage secrets while ingress remains disabled.** Generate five distinct database passwords, distinct vault/HMAC keys and the broker client secret in private memory. Store only the required values in the staging Supabase/Vercel secret stores. Set all server and public feature flags to disabled. Read back names, scope and environment only; never read or record values.
3. **Install database generation 6 once.** Through the reviewed private credential transport, reassert the readiness baseline, then in one transaction give each fixed runtime role its distinct password, `LOGIN`, common `VALID UNTIL`, its one expected executor membership and the exact active generation-6 marker. Do not use the SQL editor or shell history for secret-bearing SQL. Preserve a nonsecret journal before dispatch. An uncertain acknowledgement forbids replay and triggers recovery/reconciliation.
4. **Verify credentials with controls disabled.** Open one bounded connection per runtime identity. Prove the role can connect only before the common expiry, has only its expected membership and function surface, cannot read private tables, cannot use another role's function, and receives the disabled-control response. Close every connection and prove zero runtime sessions.
5. **Read back provider configuration.** Verify Shopify discovery, issuer, client ID, exact preview callback, logout URI and scopes; verify the Supabase broker callback and token/userinfo endpoints. Stop on any redirect, scope, store, issuer or credential-mode difference.
6. **Deploy immutable preview disabled.** Deploy the reviewed commit with all secrets/configuration present but `TLL_STAGING_CUSTOMER_ENABLED=false`, `TLL_STAGING_CART_ENABLED=false`, and both `NEXT_PUBLIC_TLL_STAGING_*` flags absent or disabled. Record deployment ID, immutable URL, commit and manifest hash. Prove protected account/cart routes remain unavailable and cross-role denial still holds.
7. **Enable database controls.** Enable customer, cart, broker, provisional and bridge controls through their reviewed operator surfaces in one bounded window. Re-read all five. External ingress remains disabled.
8. **Enable Edge, then server runtime.** Set the broker Edge flag to `true` and verify authenticated protocol rejection/acceptance without a customer journey. Then set the two private Vercel server flags to `true`, deploy and verify. Only after that set the two public preview flags to `enabled`, deploy the immutable enabled preview and prove the stable alias resolves to it.
9. **Run one staging journey.** Use the named test account for login, saved research, account cart, navigation to the Shopify checkout page, return, orders view and logout. Do not submit an order. Capture sanitized receipts only.
10. **Close the window.** Disable public, server and Edge flags; disable database controls; run the pinned recovery transaction and its fresh-session zero-runtime-session proof; remove/revoke transient platform secrets; record the retired generation-6 marker and final disabled-state evidence.

## Recovery triggers

Run recovery without retrying the failed activation step after any uncertain database acknowledgement, partial credential installation, mixed marker or expiry, unexpected membership/ACL, failed cross-role denial, control-state mismatch, unexpected provider readback, immutable-deployment mismatch, route availability before its gate, runtime session that does not close, window expiry, or interrupted activation after generation-6 credentials exist.

First block ingress where its state is known. Then run `config/staging-account-activation-recovery.sql` from the exact staging operator and run `config/staging-account-activation-recovery-postcommit.sql` in a fresh session. A recovery acknowledgement that is itself uncertain is reconciliation-only; never replay it blindly. The successful terminal state is five disabled controls, held/cancelled work, five `NOLOGIN PASSWORD NULL` roles with no executable memberships, one exact retired generation-6 marker, zero runtime sessions, and disabled external feature flags.
