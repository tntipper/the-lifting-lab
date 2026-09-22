# Staging unified-account activation runbook

This runbook activates the already reviewed source journey on `qdmvngjwkcsilzmqksme` and the protected Vercel preview only. Production `wrhgscovsgsudtedbljr`, purchases, customer email and live Shopify merchandise are outside the window. The machine-readable source of truth is `config/staging-account-activation-manifest.json`; regenerate it with `node scripts/staging-account-activation-manifest.mjs` and require `--check` to pass immediately before any window.

Current checkpoint: Generation 21 is retired and non-replayable. The provider,
control and surface state machines plus their target-bound adapter contracts are
reviewed and disabled. They have no native launcher, their required bounded
executors remain injected, hosted execution is not approved and Generation 22
is not armed. Do not interpret the presence of these modules as permission or
capability to mutate staging.

## 1. Freeze and read-only preflight

Record the exact Git commit, manifest SHA256 and immutable preview URL. Confirm the Supabase project ref, Vercel project ID and Shopify development-store domain match the manifest. Confirm credential generations 1–5 remain retired, hosted migrations are exactly 002–011, all five repository controls are disabled, new 012–016 relations/functions are absent, and production identifiers do not appear in any target command or configuration value. Stop on any drift.

Use only the source-pinned `preflight` package for one authenticated Management API read. Its fixed `BEGIN READ ONLY` query must return the exact redacted receipt for the staging bootstrap, migrations 002–011, five disabled controls, retired generation 5, zero runtime sessions and absence of 012–016. The runtime receipt requires five total runtime edges, five qualifying ADMIN-only edges to the staged operator, and five distinct qualifying runtime roles. It accepts no caller SQL, endpoint or project. A missing, rejected or mismatched receipt ends the window before any database write. PostgreSQL 17 retains the prerequisite authority edge when a second grantor creates a duplicate grant, and revoking that edge cascades the dependent grant; the actual PostgreSQL fixture therefore proves the supported six-edge duplicate state is rejected, while the client validator separately rejects the synthetic five-edge/five-row/four-distinct receipt.

The provider and both `TLL_STAGING_*_ORIGIN` settings use only `runtime.reviewedPreview.stableOrigin`: the protected Vercel Git-branch alias for `codex/tll-integration`. It is supported by recorded Vercel evidence showing two distinct immutable preview deployments behind that alias. Do not register or configure an immutable deployment URL as a callback or runtime origin.

For both the disabled and enabled phases, record an immutable deployment evidence tuple containing `deploymentId`, `immutableUrl`, `sourceCommit` and `manifestSha256`, then prove the stable alias resolves to that deployment before running checks. The immutable URL is the source-evidence identifier; the stable alias is the only browser return origin. If the alias is absent, points to a different deployment, or is no longer a protected `codex/tll-integration` branch alias, hold the window and do not substitute a unique deployment URL.

Verify Shopify discovery still returns the pinned issuer, authorization, token, JWKS and end-session endpoints. Confirm the existing confidential client ID, exact preview callback URI, preview `/auth` logout URI, scopes and Customer Account order permission. Confirm the custom Supabase broker configuration is still absent or disabled. This is inspection only.

## 2. Install the disabled database layer

Use only the manifest-pinned `disabledMigrationInstall` package. Its actual PostgreSQL 17 acceptance must pass against the exact generated transaction before the window. Do not use `supabase db query`, link, dump or another generic CLI database resolver: those paths can create or refresh writable credentials outside this reviewed transaction.

Proceed only after the authenticated read-only preflight returns PASS and confirms the Management API status/envelope assumed by the installer. Verify the enabled JavaScript and Python flags, regenerated transport manifest, generated SQL hash and activation-manifest pins as one exact diff. The committed source remains disabled and `executionPolicy` remains a hold until these gates are recorded.

Before the only request, the installer must acquire the exclusive journal claim at `disabledMigrationInstall.dispatchJournal.path`. The nonsecret intent binds the run ID, staging target, install ID, exact transaction hash and migration source hashes and is fsynced before dispatch. An existing intent, uncertainty or completed receipt forbids another install request. A timeout, rejected/malformed response or lost acknowledgement becomes `RECONCILIATION_REQUIRED`; stop and perform an independent read-only installed-state check. Never retry an uncertain installation.

Open one bounded operator window and send the fixed package once. It applies migrations 012, 013, 014, 015 and 016 in one outer transaction without enabling any control. Every canonical migration retains its source and authority preflight. Accept success only when the exact redacted receipt validates and the journal reaches `RECEIPT_VALIDATED`; otherwise leave the application closed and reconcile read-only.

Before creating runtime logins, verify exact owners, RLS, ACLs, function source hashes, search paths, foreign keys, empty new stores and all five controls disabled. Verify anonymous, authenticated and service roles cannot read private relations or execute private helpers. Preserve a catalog/data fingerprint and the migration receipts.

## 3. Create isolated runtime credentials

Before creating any LOGIN or secret, require `node scripts/staging-account-activation-recovery.mjs --check` and compare all recovery source hashes with `manifest.recovery.sources`. The recovery contract is [Staging account activation recovery](staging-account-activation-recovery.md). It is bound to credential generation 6 and window `83888906-23fa-4653-a886-fe2733ed76a0`, and its fresh-session post-commit proof must confirm zero runtime sessions. If the package is stale, incompatible with the installed 012–016 surface, or cannot execute through the same bounded operator transport, do not provision credentials.

Create fresh passwords for the five existing NOLOGIN purpose roles through separate runtime LOGIN roles. Each LOGIN receives only the membership in the manifest: customer executor, cart gateway, broker executor, provisional executor or bridge executor. The bridge LOGIN must not inherit broker or provisional executor membership. Verify zero cross-purpose access with fresh connections, then store each password only in its named Vercel/Edge secret destination. Never paste a password into source, logs, the manifest or this runbook.

Create four distinct customer vault keys plus the separate cart vault and HMAC keys. Key IDs and key material must be unique. Configure the pinned public CA and fingerprint, Shopify confidential secret, broker secret and storefront token only in their required server environments. Keep every activation flag false or absent.

## 4. Deploy inert machine and web surfaces

Deploy the two pinned Edge functions with platform JWT verification disabled because their protocol authentication is Confidential Basic or the one-use broker bearer. Keep `TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED` false and prove both functions return the fixed unavailable response without opening a database session.

Deploy an immutable Vercel preview with server configuration present but customer/cart feature flags disabled. First record its disabled-phase immutable evidence tuple and prove the stable alias resolves to it. Set both `TLL_STAGING_*_ORIGIN` values to the stable alias, then prove `/api/account/orders` and `/auth/customer/logout` remain unavailable, no account UI link appears, no provider redirect is emitted and cross-purpose database calls are denied. A Vercel protection bypass, if separately approved for automated checks, must be temporary and revoked after the run.

## 5. Configure providers while application gates stay closed

Configure the existing Shopify confidential client with only the stable-alias callback and logout URI from the manifest. Configure the Supabase custom broker with the manifest client ID, token endpoint, userinfo endpoint, callback, `subject` scope, PKCE and email-optional behavior. Do not recreate either client. Read back and compare every setting before enabling a database or application control.

The broker rotation must use the manifest-pinned injected contract through a
separately reviewed native adapter. Before generating material, its exact
target-bound preflight must prove the provider, Edge, private and public gates
are disabled and that the broker secret name is absent in both Vercel Preview
and Supabase Edge. A provider-update attempt with a lost or malformed
acknowledgement is `RECONCILIATION_REQUIRED`; retain the staged destinations
and do not retry or guess the old write-only value.

The adapter can inspect and disable the documented blank-scope provider before
rotation, but the final disabled readback must be fresh. The pre-update read may
contain repairable scope/configuration drift; a configured JWKS remains a hard
stop. The post-update read must equal the exact desired provider projection.

## 6. Activate in dependency order

Enable the customer, cart, broker, provisional and bridge database controls only after the disabled denial checks pass. Enable the Edge broker next and run fixed protocol smoke checks. Enable the server customer/cart flags last, producing a new immutable preview. Record the enabled-phase immutable evidence tuple and prove the same stable alias resolves to it before the authenticated journey. Stop and retire the window if any expected hash, role, permission, endpoint, origin or response differs.

Use the pinned control transaction once: it validates the exact runtime roles,
markers, memberships, operator authority, disabled controls and zero runtime
sessions, enables all five controls atomically, restores the four temporary
owner SET edges to ADMIN-only and returns one redacted receipt. Any lost or
malformed acknowledgement requires read-only reconciliation.

Surface writes are Edge, private, then public. Configuration readback alone is
insufficient. After the writes, require a distinct newly created immutable
Preview whose creation follows the final flag receipt, exact source and manifest
pins, stable-alias resolution, TLS checks and runtime proof of Edge, private and
public flags. A lost enabled-deployment acknowledgement remains
`RECONCILIATION_REQUIRED` even if a later held build currently owns the alias.
The runtime readiness route is Preview-only and secret-free. It binds the
immutable deployment identity, fixed staging ref/branch, private runtime flags
and the public environment/customer/cart flags compiled into that deployment.
The Edge flag is proved separately at its Supabase boundary.

## 7. Acceptance without purchase

Use one owner-controlled email and one test customer. Complete one sign-in/reconciliation journey, verify the existing guest/account cart choice without checkout, load the bounded recent-orders page, and sign out through the unified POST route. Confirm the orders response contains only the allowlisted projection, another owner cannot access it, the Supabase session is invalidated, local generation advances once, active reads and broker work are held/cancelled, and Shopify returns only to the configured preview `/auth` URI. Do not add an item to a live basket or place an order.

Repeat only idempotent reads needed to prove no replay. Do not retry a provider exchange, uncertain order read or uncertain logout operation. A failed or uncertain gate leaves the system held and triggers recovery.

## 8. Closeout and recovery

Capture the final database authority/data fingerprint, deployed function/version hashes, Vercel deployment ID, provider configuration readback and acceptance results without secret values. Retire temporary operator access and any Vercel test bypass. Runtime credentials remain only if every gate passed. On any failed or uncertain activation, keep application and Edge flags closed, execute only the manifest-pinned [post-016 recovery package](staging-account-activation-recovery.md) through the reviewed staging operator transport, retire the corresponding host secrets, and preserve its preflight/postflight evidence and failed journal. Never use the older migrations-002–011 retirement script after this window, and never roll a failed window forward by changing an assertion in place.
