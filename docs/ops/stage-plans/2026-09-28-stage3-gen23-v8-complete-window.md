# Stage 3 Generation 23 v8: one complete protected customer test

## Why this successor exists

The v7 supervised test stopped before customer activation. Its held Preview build was ready; the website consumer request completed HTTP 200 after four role checks. The whole-route record then held at `consumerReadiness`, and Supabase recorded no broker Edge invocation at that time. The exact failed substep is unproved. V7 was recovered separately: five temporary database identities have no login or password, sessions and controls are zero, the provider is disabled, and the broker readiness switch is absent. Preserve all v7 records and never replay that window.

V8 adds one private, secret-free consumer progress record. It identifies whether a stop occurred during the build, deployment identity, website request or validation, broker service-key lookup, broker request or response validation. Its purpose is diagnosis if the route holds again; it does not relax any existing check or replace final recovery.

## Preconditions before publication

1. Keep every source switch OFF and the window expiry placeholder unset. Verify the current branch, exact local source, remote head and working tree. Preserve unrelated untracked files and all old one-use records.
2. Run the focused consumer, broker, predecessor, launcher and isolation tests, then the complete local suite at stable concurrency, typecheck, lint, both manifest checks and live-boundary check. Run the complete offline route and relevant failure injections. A failed check is a finding to diagnose before publication.
3. Obtain independent review of the entire disabled v8 diff, including the diagnostic record, new window ID, predecessor v7 retirement contract, all 20 unused v8 records, and the exact future arming mechanism. Repair findings and repeat affected proofs.
4. Make a disabled source commit. Publish that exact commit only to the protected `codex/tll-integration` Preview branch with separate action-time owner approval and a remote-head compare. **Redeploy the disabled broker readiness function to staging:** its pinned v8 window ID changed, and the old v7 function would reject the new window. Verify deployment source, login protection, four account/cart flags OFF and broker held response.

## Preconditions before one supervised run

5. Obtain a fresh read-only starting-state check from the actual staging services: five roles NOLOGIN/passwordless, zero sessions and zero controls ON, provider disabled, readiness switch absent, protected Preview source and flags OFF. Verify all three pinned v7 record fingerprints (whole-route HOLD, database retirement, broker-gate retirement) and all 20 v8 record paths absent. Confirm the saved Vercel, Supabase and Preview credentials can be read privately; never print them.
6. Prepare one exact local-only arming change: turn on only the 68 policy-listed gates and set a fresh one-hour expiry with at least 45 minutes remaining. Verify the patch paths and hash, compiled route, source manifest and published disabled source. Obtain independent review of the exact patch and separate action-time owner approval. The arming commit must never be pushed.
7. With the owner at the Mac, invoke the single parent launcher once. It must build a held Preview after settings change, prove its exact source, complete website and broker consumer checks, then temporarily activate the staging account/cart/provider/database controls. The owner completes visible Shopify sign-in. The test reads orders and cart, opens checkout by GET only, logs out, and does not purchase or send a campaign.

## Result and recovery

8. On PASS, independently verify account/cart/checkout flags OFF, provider disabled, broker switch absent and response held, five roles NOLOGIN/passwordless, zero sessions and controls ON, and the final held Preview source. Revert the local arming commit; preserve all records.
9. On HOLD or uncertain write, do not rerun any one-use operation. Read the new consumer diagnostic and each existing journal, then perform fresh read-only inventory. Any cleanup is a separate minimal reviewed recovery action. Prove the same held state as above and disarm. Never infer cleanup from credential expiry alone.

No step here authorises production deployment, a purchase, customer message or a replay of v7.

The v7 consumer failure's underlying cause remains unproved. V8 makes the next failure diagnosable; it does not claim to have corrected an unknown root cause. The joined local test covers the real assembled consumer path with fake network responses for success, malformed website replies, broker credential/transport failures, broker 503 and journal-write failure. A failed journal write leaves `PENDING` and stops before the next request, which must be treated as an uncertain result rather than a PASS.
