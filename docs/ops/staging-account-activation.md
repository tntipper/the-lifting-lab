# Staging unified-account activation runbook

This runbook activates the already reviewed source journey on `qdmvngjwkcsilzmqksme` and the protected Vercel preview only. Production `wrhgscovsgsudtedbljr`, purchases, customer email and live Shopify merchandise are outside the window. The machine-readable source of truth is `config/staging-account-activation-manifest.json`; regenerate it with `node scripts/staging-account-activation-manifest.mjs` and require `--check` to pass immediately before any window.

## 1. Freeze and read-only preflight

Record the exact Git commit, manifest SHA256 and immutable preview URL. Confirm the Supabase project ref, Vercel project ID and Shopify development-store domain match the manifest. Confirm credential generations 1–5 remain retired, hosted migrations are exactly 002–011, all five repository controls are disabled, new 012–016 relations/functions are absent, and production identifiers do not appear in any target command or configuration value. Stop on any drift.

Verify Shopify discovery still returns the pinned issuer, authorization, token, JWKS and end-session endpoints. Confirm the existing confidential client ID, exact preview callback URI, preview `/auth` logout URI, scopes and Customer Account order permission. Confirm the custom Supabase broker configuration is still absent or disabled. This is inspection only.

## 2. Install the disabled database layer

Open one bounded operator window with fresh temporary credentials. Apply migrations 012, 013, 014, 015 and 016 in manifest order without enabling any control. Every migration performs its own source and authority preflight. A failure ends the window; do not skip, edit or replay a partially applied migration.

Before creating runtime logins, verify exact owners, RLS, ACLs, function source hashes, search paths, foreign keys, empty new stores and all five controls disabled. Verify anonymous, authenticated and service roles cannot read private relations or execute private helpers. Preserve a catalog/data fingerprint and the migration receipts.

## 3. Create isolated runtime credentials

Create fresh passwords for the five existing NOLOGIN purpose roles through separate runtime LOGIN roles. Each LOGIN receives only the membership in the manifest: customer executor, cart gateway, broker executor, provisional executor or bridge executor. The bridge LOGIN must not inherit broker or provisional executor membership. Verify zero cross-purpose access with fresh connections, then store each password only in its named Vercel/Edge secret destination. Never paste a password into source, logs, the manifest or this runbook.

Create four distinct customer vault keys plus the separate cart vault and HMAC keys. Key IDs and key material must be unique. Configure the pinned public CA and fingerprint, Shopify confidential secret, broker secret and storefront token only in their required server environments. Keep every activation flag false or absent.

## 4. Deploy inert machine and web surfaces

Deploy the two pinned Edge functions with platform JWT verification disabled because their protocol authentication is Confidential Basic or the one-use broker bearer. Keep `TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED` false and prove both functions return the fixed unavailable response without opening a database session.

Deploy the exact immutable Vercel preview with server configuration present but customer/cart feature flags disabled. Prove `/api/account/orders` and `/auth/customer/logout` remain unavailable, no account UI link appears, no provider redirect is emitted and cross-purpose database calls are denied. A Vercel protection bypass, if separately approved for automated checks, must be temporary and revoked after the run.

## 5. Configure providers while application gates stay closed

Configure the existing Shopify confidential client with only the exact preview callback and logout URI from the frozen preview. Configure the Supabase custom broker with the manifest client ID, token endpoint, userinfo endpoint, callback, `subject` scope, PKCE and email-optional behavior. Do not recreate either client. Read back and compare every setting before enabling a database or application control.

## 6. Activate in dependency order

Enable the customer, cart, broker, provisional and bridge database controls only after the disabled denial checks pass. Enable the Edge broker next and run fixed protocol smoke checks. Enable the server customer/cart flags last, producing a new immutable preview. Stop and retire the window if any expected hash, role, permission, endpoint, origin or response differs.

## 7. Acceptance without purchase

Use one owner-controlled email and one test customer. Complete one sign-in/reconciliation journey, verify the existing guest/account cart choice without checkout, load the bounded recent-orders page, and sign out through the unified POST route. Confirm the orders response contains only the allowlisted projection, another owner cannot access it, the Supabase session is invalidated, local generation advances once, active reads and broker work are held/cancelled, and Shopify returns only to the configured preview `/auth` URI. Do not add an item to a live basket or place an order.

Repeat only idempotent reads needed to prove no replay. Do not retry a provider exchange, uncertain order read or uncertain logout operation. A failed or uncertain gate leaves the system held and triggers recovery.

## 8. Closeout and recovery

Capture the final database authority/data fingerprint, deployed function/version hashes, Vercel deployment ID, provider configuration readback and acceptance results without secret values. Retire temporary operator access and any Vercel test bypass. Runtime credentials remain only if every gate passed; otherwise disable all controls and flags, revoke the new runtime passwords/secrets, drain bounded staging sessions, and preserve the failed journal for diagnosis. Never roll a failed window forward by changing an assertion in place.
