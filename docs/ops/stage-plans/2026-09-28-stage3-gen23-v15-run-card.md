# Generation 23 v15: fixed-ID website activation and supervised staging run card

Date: 28 September 2026

## Purpose

V15 is the fresh successor to the consumed v14 attempt. V14 safely reached the final website-enable phase, but the clean runner's Vercel command-line login was rejected even though the same restricted token worked through Vercel's management API.

V15 removes Vercel CLI from the four customer/cart setting changes. It instead updates four already verified setting IDs through Vercel's HTTPS management API, then reads each setting back in decrypted form and requires the exact expected value, branch, Preview target, project and setting type. Every request has a twenty-second deadline and a late response cannot be accepted after a timeout. The Supabase command-line tool remains limited to the single Edge-secret operation it already completed successfully.

The first fresh hosted inventory after disabled publication found that the cart setting's current ID contains `n`, not `8`. No live window or v15 record existed, all five settings were still off, and the Preview was still building. The fixed ID and a regression test were corrected before any arming change.

## Disabled v15 identity

- Active window ID: `35b6910a-3a5c-4721-9452-f5074829f91c`.
- Edge revision: `tll-gen23-v15-cart-route-1`.
- Exact predecessor window: retired v14 window `e2cb29d6-3900-44d4-813b-dad37292d412`, expiry `2026-09-28T14:27:00.000Z`.
- All twenty one-use records use fresh `-v15.json` paths.
- The launcher pins the v14 whole-route, database-retirement and broker-window-removal records by their exact SHA-256 fingerprints.
- All ordinary customer, cart, checkout, provider, database and Edge enable switches remain off. The live expiry remains unset in this disabled source.

## Evidence before publication

- Full automated suite after the hosted-ID correction: 3,272 passed, two skipped, zero failed.
- Type checking and the production build passed.
- Lint completed with zero errors and 19 existing warnings outside this correction.
- Both generated manifests, the live-boundary policy and `git diff --check` passed.
- Publication requires two independent swarm reviews of the exact disabled commit. Arming requires two further independent reviews of the exact local-only arming change.

## Ordered live route

1. Publish the exact reviewed disabled commit only to `codex/tll-integration` and wait for its protected Vercel Preview.
2. Redeploy the changed broker-readiness Edge source while its gate remains off, then prove the served v15 revision, broker-off result and absent v15 window.
3. Recheck the protected source and deployment, login protection, five Vercel controls off, provider disabled, five database roles retired, zero sessions, v14 predecessor evidence and absence of every v15 record.
4. Create one local-only arming commit with a fresh expiry. Never push or replay that arming commit.
5. Run the complete launcher once. It must prove settings, temporary database roles, restricted connections, website and broker consumers, provider, database and protected Preview before opening the owner browser.
6. Continue through the staging product/cart, owner sign-in, order isolation, guest-cart transfer, guarded GET/HEAD-only Shopify checkout page and logout. Stop before any purchase or payment submission.
7. Shut down the website, checkout, database, provider and Edge controls; build and prove a held Preview; drain sessions; retire all five roles/passwords/grants; remove the broker window; and perform the independent final held-state read.

An uncertain hosted write consumes its record and stops the route. Recovery uses fresh read-only evidence and separately reserved shutdown/retirement records; it never retries the uncertain write or replays the whole run.
