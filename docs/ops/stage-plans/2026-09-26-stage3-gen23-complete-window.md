# Stage 3 Generation 23: complete held-test window

This plan supersedes the Gen22 setup order for the next staging attempt. It does not authorize a hosted write, branch push, deployment or activation. Production, purchases and customer messages remain out of scope.

## Starting evidence to preserve

- Staging branch `codex/tll-integration` is published at `79f685c64f5ef67b19861d0beba9ddf18d77309c`. Protected Vercel Preview `dpl_FshKoWhQE6anmCajVB6MmqdStkKn` is Ready from that source. Three authenticated reads proved the four account/cart controls OFF; unauthenticated reads returned 401.
- Gen22's five database logins were retired in the separate incident action. Its setup, recovery and retirement journals are consumed. Existing vaults, cart HMAC key, client secret and disabled custom provider are retained.
- The five branch-specific Vercel database-password Secrets and the matching Supabase Edge broker-password name exist, but the Gen22 values no longer grant database login. Changing them does not update the already-built Preview. The staging Shopify Storefront token was privately rotated, stored as a Vercel Secret and its old token revoked; new token function has not been tested.
- Local disabled Gen23 modules generate only five replacement passwords and build a fixed read-only database predecessor check. The predecessor query transport is bounded and disabled. These modules are not proof of a successful hosted Gen23 run.

## Goal and acceptance

Run one protected staging account/cart test with fresh, temporary database logins and matching Preview/Edge passwords; show sign-in, account, orders isolation, cart and checkout handoff without purchase; then turn every surface OFF, retire all five logins/passwords/grants and independently prove the final held state. The final proof must include source/deployment identity, provider and Edge state, four public/private flags, database controls, sessions and role privileges. A timed-out password is not retirement proof.

## Build the whole disabled package before opening a credential window

1. **Fresh starting proof.** A dedicated one-use read-only journal must record the fixed Gen22-retired database check, official provider GET, Edge secret-name inventory, effective branch-only Vercel setting names/types/IDs and the protected Preview source/flags. The SQL must run as the `postgres` execution identity inside `BEGIN READ ONLY`. A lost response consumes the one-use record; it cannot be treated as a pass.
2. **Five exact replacements.** Update only the five existing Vercel Preview branch password Secret IDs and the one staging Supabase Edge broker-password value. Preserve all other Secret IDs, names, types, branches and values. Vercel's documented existing-variable operation is PATCH by ID; prove its exact request, response and effective branch-scoped readback with mocks before using it. Never read a decrypted value or print a password. Secret replacement occurs before database login activation so partial settings cannot open a login. Supabase's secret update becomes available to Edge immediately; keep its feature switch OFF.
3. **One guarded database transaction.** Require the fresh Gen22-retired proof, exact staging identity/migrations, no sessions and all controls OFF. Install only five new verifiers, logins and narrowly scoped grants, with a unique Gen23 marker and an expiry no more than one hour away. Check the database clock before installation and commit. Store a dispatch intent before the POST; a lost reply triggers read-only reconciliation, never a second POST. Prove all five restricted connections and drained sessions while controls remain OFF.
4. **Activation and Preview.** Recheck the disabled provider and reviewed settings, then activate in the reviewed provider → database → Edge → private server → public build order. Vercel environment changes affect only a new deployment, so pin and prove a new immutable protected Preview. Verify effective values without revealing secrets. The branch alias must point to that exact build. Account/cart tests use only an owner-controlled email and must stop before purchase.
5. **Independent retirement.** Turn public/private/Edge/database controls OFF; drain sessions; run a separately reserved, bounded retirement transaction that clears login/passwords, runtime grants and provider access while preserving inert operator links. Use a distinct one-use recovery record and read-only postflight transaction. If any result is uncertain, stop, retain evidence and reconcile before another attempt. Verify the protected Preview returns to disabled behavior.

## Proof and failure rules

- Test each disabled component with injected transports and unexpected statuses, redirects, oversized responses, aborts, late replies, wrong branch/ID, partial writes and stale records. Keep the original user-facing site tests passing. An independent reviewer must check the complete disabled sequence and exact temporary arming diff.
- Each hosted effect gets an exclusive durable nonsecret dispatch record before the call and an exact receipt afterward. No record may be replayed. The parent must terminate the entire child process group at a fixed deadline, including Keychain prompts and stuck database close. Password buffers are erased after use.
- Freshly verify source tree, remote predecessor, Vercel protection, provider, Edge names, database state, window expiry, unused records and exact patch immediately before the action. Obtain separate action-time approval for hosted settings, provider, publication and activation under the Stage 3 gate protocol. A failed or uncertain effect pauses dependent work; investigate root cause and update the plan before a new window.

## Known high-impact assumptions to prove cheaply

- The Vercel PATCH endpoint accepts in-place replacement of an existing sensitive, branch-specific Preview variable without broadening its target. Check the official response shape and effective inventory before building the live connector. [Vercel REST API](https://vercel.com/docs/rest-api), [environment-variable management](https://vercel.com/docs/environment-variables/manage-across-environments).
- Supabase's fixed staging Edge secret overwrite keeps the same name and takes effect immediately, so the disabled Edge switch must be independently checked. [Supabase Edge secrets](https://supabase.com/docs/guides/functions/secrets).
- The current account/cart deployment cannot see rotated Vercel values; a new protected Preview must be built and pinned. [Vercel environment variables](https://vercel.com/docs/environment-variables).
- Provider behavior after the earlier partial JWKS-clear attempt is known only for the disabled state with retained URI. Do not infer that enabling it will work; use an official read and one bounded reviewed staging change, then prove login before enabling public controls.

The next development unit is the one-use Gen23 predecessor observer and journal, followed by the exact five-ID Vercel replacement contract. Keep both disconnected while the full window and recovery path are incomplete.
