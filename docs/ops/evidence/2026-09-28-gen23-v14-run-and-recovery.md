# Generation 23 v14 live staging run and recovery

Date: 28 September 2026

## Outcome

The owner-approved v14 run used published disabled source `335a2e2b1e716d2e56df4985437e243d00bebf17` and one local-only arming commit `e199125e807591730eda8d85ebcc5f63975eea92`. The arming commit is preserved on `codex/gen23-v14-armed-evidence`, was never pushed, and must never be replayed.

V14 passed the disabled baseline, temporary setting installation, database setup, all five restricted connection checks, their session drain, a fresh held Preview consumer build, website and broker consumer readiness, provider enable, database-control enable, and checkout-setting enable. It then stopped at customer-surface activation with `RECONCILIATION_REQUIRED`. The owner browser never opened. No product visit, Shopify sign-in, cart action, checkout request, order, payment or purchase occurred.

The full recovery is complete. The final combined read returned `FINAL_HELD_VERIFIED`: database roles retired with zero sessions and controls off, provider disabled, broker held, broker window absent, Edge held, all five Vercel settings off, the fixed alias on a fresh held protected Preview, and that Preview reporting customer, cart and checkout off.

## Identities

- Published disabled source: `335a2e2b1e716d2e56df4985437e243d00bebf17`.
- Initial disabled Preview: `dpl_AtaqUS4CWFFAzGm9UvFDLA4cu21J`.
- Consumer-readiness Preview: `dpl_CBqUNUX1JJBZ1ZuPLP2GdQm9Mh1P`.
- Fresh held recovery Preview: `dpl_82nQbuQRyH3dXW6UUHUKB8uQqEGg`.
- Held immutable URL: `https://the-lifting-hjdl1c0x8-my-lifting-lab-s-projects.vercel.app`.
- Local-only arming commit: `e199125e807591730eda8d85ebcc5f63975eea92`.
- Active window: `e2cb29d6-3900-44d4-813b-dad37292d412`.
- Expiry: `2026-09-28T14:27:00.000Z`.
- Whole-route run: `66f59c78-c64f-4422-9ef1-9e88d4f0c3fc`.

## Remaining command defect

V14 proved that the v13 argument-order correction was necessary but not sufficient. The exact clean-environment runner successfully switched the Supabase Edge flag off during recovery, but its first safe Vercel write of `TLL_STAGING_CUSTOMER_ENABLED=false` failed generically. The same token then succeeded immediately through Vercel's fixed-ID management API.

The earlier post-v13 diagnostic was not a proof of the runner's token path: it unexpectedly reused the Mac's saved Vercel login. V14's failure therefore points to the CLI's deliberately stripped environment or token/config handling, not to the setting ID or Vercel API permission. Preserve the v14 surface record; do not retry it. The successor should replace the four Vercel CLI setting writes with the already proven fixed-ID management API and retain decrypted readback.

## Recovery sequence

1. Database shutdown returned `SHUTDOWN_VERIFIED`.
2. Provider disable returned `PROVIDER_DISABLED_VERIFIED`.
3. Edge was set off and its token endpoint returned HTTP 503 with the disabled-control header.
4. The four exact customer/cart Vercel rows were forced off through the fixed-ID API and each was read back decrypted with the expected off value.
5. The separate checkout freeze returned `CHECKOUT_SETTING_HELD_VERIFIED`.
6. Fresh protected Preview `dpl_82nQbuQRyH3dXW6UUHUKB8uQqEGg` was built and verified with public customer/cart off.
7. A read found database controls off and zero sessions.
8. Database retirement returned `RETIREMENT_VERIFIED`.
9. Broker-window removal returned `BROKER_GATE_RETIRED_VERIFIED`.
10. The independent database final read returned `PASS_FINAL_RETIRED`.
11. The combined hosted audit returned `FINAL_HELD_VERIFIED` and also confirmed login protection.

## Record fingerprints

- Whole-route HOLD: `a099680e3ca59176c22cb02d990388ac81530ddb94ecbd8a862f4d705f466953`.
- Surface reconciliation required: `a41b893fa1fa7b55ffda1f8361af0978a9165f6fb140d8d140e74d90db31a507`.
- Database shutdown: `816a0a4046d74e18694266906910f18dc599929336f1d70401a2c286d4faa564`.
- Provider disable: `0959628273b14f23a519dda49048ee3e1dba73146ebfe0da0aebf942adeda721`.
- Checkout freeze: `48505d840a52fb783f29406f8f75408a1c2e9ab8d5b904a4b67366a2d22c9b8a`.
- Held Preview: `4d40ac4ae9b33ccc70030310fd7959bbee2fc6790ea346a4c8f275d48252812a`.
- Database retirement: `0e3e3ebb21206bbfe82ba59ce8885210489c22972cd7f0ea4588dfd38a885717`.
- Broker-window removal: `79f6e21b22df0b6452d553a1a4ae08ac872173e74463b9be920db35e8f8fa2db`.
- Final database read: `bf60a34b336fcf07b5a2d947c81d884490cc4aeb8962a3fae4bd5fab1127f094`.

## Remaining live work

The completion register remains **1 of 8**. V14 did not reach the customer journey, so product/cart, owner sign-in, order isolation, guest-cart linking, guarded Shopify checkout and logout remain unproved live. The next attempt needs fresh identities and one-use records and the management-API surface-setting correction. No production change or purchase is required.
