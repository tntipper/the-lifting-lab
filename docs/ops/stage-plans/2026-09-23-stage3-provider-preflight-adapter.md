# Stage 3 provider normalization: disabled preflight adapter

## Outcome and boundary

Compose the existing fixed, read-only staging bindings into the coordinator's exact frozen-state receipt. The adapter must expose no ambient credentials, fetch, CLI or hosted write path. This unit has zero hosted calls and leaves the provider and all activation gates untouched. Production ref `wrhgscovsgsudtedbljr` is excluded.

## Evidence and design

The database binding sends the pinned `BEGIN READ ONLY` SQL, whose strict receipt proves all 15 migrations, five disabled controls, retired passwordless/NOLOGIN runtime roles and zero sessions/edges. The Supabase secret reader returns names only. The Vercel Preview inventory returns a target-bound broker-secret presence. The surface binding returns Edge disabled status and both private and both public readiness flags from the exact pinned deployment. The composite hosted observer is unsuitable here: it currently has known provider/manifest HOLDs unrelated to a frozen-state read.

Use injected factories for *new* instances of these bindings on each preflight. Require exact target and receipt shapes, a passing database query ID/count/hash, absence of the broker secret in both hosts, both private and both public flags false, and the exact staging surface target. Stamp the receipt with the beginning of observation (conservative freshness); reject if all reads do not finish within 30 seconds. Dispose bindings after each observation. Fail closed on malformed, missing, stale or drifted evidence. Expose a separate official provider read through a fresh Supabase binding; do not let the adapter infer provider state from the older full observer. The coordinator still owns intent, update and independent post-read.

## Verification and next gate

Test synthetic passing receipt and every unsafe boundary, including delayed reads, target drift, nonempty secret inventory, a single enabled surface flag, broken database count/query ID and provider-read errors. Pin source/tests in the activation manifest. Run focused suite, full disabled suite, typecheck, lint, both manifests, live-boundary and diff checks once after the final change. Seek independent review of the exact adapter. Only then plan a separately reviewed native launcher with phase deadlines and action-time access; no live arming from this plan.

## Review correction and verified boundary

The first adapter revision expected `target` on the Vercel binding instance. The actual fixed Vercel binding carries target identity on its project and Preview-inventory receipts, so the first revision would reject a legitimate binding before reading. The direct cause was testing a hand-built binding object that did not match the real interface. The adapter now validates target identity on both returned receipts, and a regression constructs the real Vercel binding with synthetic HTTP responses. Binding cleanup failures also fail closed. Independent re-review returned **GO for disabled integration/launcher planning**, with hosted arming still HOLD. The tests use no hosted credentials or requests. The next unit must inject concrete fixed readers and a working deadline signal, then independently review the complete read/update boundary before any one-run credential window.
