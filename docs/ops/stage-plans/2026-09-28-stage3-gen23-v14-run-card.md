# Generation 23 v14: corrected surface activation and supervised staging run card

Date: 28 September 2026

## Purpose

V14 is the fresh successor to the consumed v13 attempt. V13 safely reached the final website-enable phase, but stopped because the Vercel command placed `--yes` before `env add`. Vercel CLI 60.1.3 interpreted that order as a deployment command and rejected `--git-branch` before making the intended setting change.

V14 moves `--yes` into the `env add` command's accepted position. The command remains restricted to the same four Preview-only customer and cart settings, the same protected branch and the same project. No production target or purchase is permitted.

## Disabled v14 identity

- Active window ID: `e2cb29d6-3900-44d4-813b-dad37292d412`.
- Edge revision: `tll-gen23-v14-cart-route-1`.
- Exact predecessor window: retired v13 window `c216a47f-5445-4076-860c-451aa8d2931e`, expiry `2026-09-28T13:44:00.000Z`.
- All twenty one-use records use fresh `-v14.json` paths and were absent during independent review.
- The launcher pins the v13 whole-route, database-retirement and broker-window-removal records by their exact SHA-256 fingerprints.
- All ordinary customer, cart, checkout, provider, database and Edge enable switches remain off. The live expiry remains unset in this disabled source.

## Evidence before publication

- Full automated suite: 3,267 passed, two skipped, zero failed.
- Type checking and the production build passed.
- Lint completed with zero errors and 19 existing warnings outside this correction.
- Both generated manifests, the live-boundary policy and `git diff --check` passed.
- Two independent swarm reviews returned PASS. Both confirmed the corrected command grammar, fresh identities, unused v14 records, exact retired-v13 predecessor pins and default-off state. Neither reviewer changed a hosted service.

## Ordered live route

1. Publish this exact disabled commit only to `codex/tll-integration` and wait for its protected Vercel Preview.
2. Redeploy the changed broker-readiness Edge source while its gate remains off, then prove the served v14 revision, broker-off result and absent v14 window.
3. Recheck the protected source and deployment, login protection, five Vercel controls off, provider disabled, five database roles retired, zero sessions, v13 predecessor evidence and absence of every v14 record.
4. Create one local-only arming commit with a fresh expiry. Never push or replay that arming commit.
5. Run the complete launcher once. It must prove settings, temporary database roles, restricted connections, website and broker consumers, provider, database and protected Preview before opening the owner browser.
6. Continue through the staging product/cart, owner sign-in, order isolation, guest-cart transfer, guarded GET/HEAD-only Shopify checkout page and logout. Stop before any purchase or payment submission.
7. Shut down the website, checkout, database, provider and Edge controls; build and prove a held Preview; drain sessions; retire all five roles/passwords/grants; remove the broker window; and perform the independent final held-state read.

An uncertain hosted write consumes its record and stops the route. Recovery uses fresh read-only evidence and separately reserved shutdown/retirement records; it never retries the uncertain write or replays the whole run.
