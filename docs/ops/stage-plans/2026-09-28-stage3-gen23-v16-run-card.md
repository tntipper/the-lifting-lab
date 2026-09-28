# Generation 23 v16: bounded connection convergence and supervised staging run card

Date: 28 September 2026

## Purpose

V16 is the fresh successor to the consumed and safely retired v15 attempt. V15 successfully installed the temporary settings and database roles, but its first customer-role connection received PostgreSQL authentication rejection `28P01`. The one permitted fresh-runtime retry then returned a redacted `other` connection failure. The route stopped before any customer-facing surface was enabled, then completed database and broker-window retirement.

V16 keeps the same credential, permission, staging-target, no-purchase and shutdown controls. It changes only the connection convergence behaviour: each role may use at most three fresh runtimes, with the existing fixed 16-second wait between attempts. The password is never changed or logged, every failed runtime is closed, the last failure still produces a safe HOLD, and no later phase can run unless all five restricted roles pass their exact identity, membership, function and denial checks.

The renamed Basket control introduced by the approved website design is also reflected in the isolated browser test. This is a test-label correction only; it does not change basket behaviour.

## Disabled v16 identity

- Active window ID: `5a1502a5-0ddd-4da3-a375-d9b34aba6ed9`.
- Edge revision: `tll-gen23-v16-cart-route-1`.
- Exact predecessor window: retired v15 window `35b6910a-3a5c-4721-9452-f5074829f91c`, expiry `2026-09-28T15:04:00.000Z`.
- All twenty one-use records use fresh `-v16.json` paths.
- The launcher pins the v15 whole-route, database-retirement and broker-window-removal records by their exact SHA-256 fingerprints.
- All ordinary customer, cart, checkout, provider, database and Edge enable switches remain off. The live expiry remains unset in this disabled source.

## Evidence before publication

- Full automated suite: 3,279 passed, two skipped, zero failed.
- The isolated browser basket journey passed at 320, 390, 768, 1024, 1280 and 1440 pixel widths.
- Type checking and the production build passed.
- Lint completed with zero errors and 23 existing warnings.
- Both generated manifests, the live-boundary policy and `git diff --check` passed.
- The three-attempt policy has explicit tests for success after one temporary failure, success after two temporary failures, and safe HOLD after three failures.

## Ordered live route

1. Publish the exact reviewed disabled commit only to `codex/tll-integration` and wait for its protected Vercel Preview.
2. Redeploy the changed broker-readiness Edge source while its gate remains off, then prove the served v16 revision, broker-off result and absent v16 window.
3. Recheck protected source and deployment identity, login protection, five Vercel controls off, provider disabled, five database roles retired, zero sessions, v15 predecessor evidence and absence of every v16 record.
4. Create one local-only arming commit with a fresh expiry. Never push or replay that arming commit.
5. Run the complete launcher once. It must prove settings, temporary database roles, restricted connections, website and broker consumers, provider, database and protected Preview before opening the owner browser.
6. Continue through the staging product and basket journey, owner sign-in, order isolation, guest-basket transfer, guarded GET/HEAD-only Shopify checkout page and logout. Stop before any purchase or payment submission.
7. Shut down the website, checkout, database, provider and Edge controls; build and prove a held Preview; drain sessions; retire all five roles/passwords/grants; remove the broker window; and perform the independent final held-state read.

An uncertain hosted write consumes its record and stops the route. Recovery uses fresh read-only evidence and separately reserved shutdown and retirement records; it never retries an uncertain write or replays the whole run.
