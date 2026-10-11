# Generation 23 v18: continue through ordinary slowness

Date: 28 September 2026

## Purpose

V18 is the fresh successor to the safely retired v17 staging attempt. V17 made genuine progress: it passed the settings and database setup, all five restricted database connections, the protected consumer Preview, website and broker readiness, provider enablement and database enablement. It stopped while enabling the website because one 180-second allowance covered both the Vercel build and every safety check performed after the build became ready. The build was healthy, but it used most of the shared allowance and left too little time for the checks that followed.

V18 corrects that test-harness problem. A healthy Preview build may now wait for up to ten minutes. Once Vercel reports the build ready, the identity, privacy, protection and alias checks receive a separate two-minute allowance. Ordinary slowness is recorded and the route continues. The route still stops for a terminal provider failure, an identity mismatch, unexpected public access, a failed security invariant, an uncertain hosted write, or loss of the final shutdown reserve.

This change does not weaken the controls around accounts, baskets or checkout. It does not permit a purchase. The outer process deadline and the protected shutdown reserve remain in place so temporary access can always be switched off and the database roles retired.

## Disabled v18 identity

- Active window ID: `d5180b08-79ee-43e8-96d4-4f73621fecbf`.
- Edge revision: `tll-gen23-v18-cart-route-1`.
- Exact predecessor window: retired v17 window `759bc8ed-5ecd-475c-8a4c-e35fcf628a73`, expiry `2026-09-28T21:05:00.000Z`.
- All twenty one-use records use fresh `-v18.json` paths.
- The launcher pins the v17 whole-route, database-retirement and broker-window-removal records by their exact SHA-256 fingerprints.
- All customer, basket, checkout, provider, database and Edge enable switches remain off. The live expiry remains unset in this disabled source.

## Disabled-source evidence

- All 308 focused Generation 23 checks passed when run serially, including the complete simulated route and the slow healthy-build case.
- The complete project suite passed with 3,280 checks passed, two intentional skips and zero failures.
- The optimized production build and TypeScript type check passed.
- Lint completed with zero errors and 23 existing warnings.
- The activation manifest was regenerated from the reviewed source. The activation manifest check, hosted-baseline manifest check, live-boundary policy and source-difference check all passed.
- A direct source scan found no enabled Generation 23 or broker-readiness gate. The active expiry remains the explicit unset marker.

## What must be proved before the live run

1. The complete automated test suite, production build, type check and lint checks pass, allowing only already-known warnings or intentional skips.
2. The generated activation and hosted-baseline manifests match the reviewed source, and the live-boundary and source-difference checks pass.
3. The protected Vercel Preview is built from the exact disabled v18 commit, remains behind Vercel authentication and reports every account, basket and checkout switch off.
4. The deployed broker-readiness function serves the exact v18 revision while its gate is off, with the v18 window absent.
5. The v17 database roles and broker window remain retired, there are no active sessions, the provider is disabled, and every v18 one-use record is absent.

## Ordered live route

1. Publish the exact reviewed disabled commit to `codex/tll-integration` and verify its protected, all-off Preview.
2. Deploy the v18 broker-readiness revision while disabled and prove that it remains held.
3. Create one local-only arming commit with a fresh expiry. Never push or replay it.
4. Run the launcher once. Continue through normal build and network delays, recording their duration.
5. Open the protected website only after settings, temporary database roles, restricted connections, consumers, provider, database and enabled Preview all pass.
6. Complete the owner journey through product selection, sign-in, My Stack, basket, account isolation, guest-basket transfer, guarded GET/HEAD-only Shopify checkout page and logout. Stop before any purchase, payment or order submission.
7. Always switch the website, checkout, database, provider and Edge controls off; build and verify the held Preview; drain sessions; retire all temporary roles and credentials; remove the broker window; and perform the final independent held-state read.

An uncertain hosted write is not treated as ordinary slowness because repeating it could duplicate a real external change. In that case the launcher moves directly to read-only reconciliation and recovery rather than replaying the write or abandoning cleanup.
