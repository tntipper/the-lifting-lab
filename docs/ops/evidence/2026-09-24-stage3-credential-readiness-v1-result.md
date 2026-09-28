# Stage 3 local credential-readiness V1 — terminal result

The owner approved one local, access-only readiness run after the exact two-switch arming preview and action plan received independent GO. This was an investigation within the open Keychain incident, not a provider-mutation attempt. No network request, new token, Keychain ACL change, provider update, deployment, purchase or customer message was in scope.

## Before the one attempt

- Fixed sibling: `../implementation-provider-credential-readiness-arm-v1`, branch `codex/tll-provider-credential-readiness-arm-v1`, clean disabled base `244f744138cd34ba4d0eb769b3e637d11e8a1937`.
- The existing Keychain items were present. Keychain Access showed “Confirm before allowing access” and a `security` application entry for each of the Supabase CLI, Vercel API and Preview bypass items. No ACL was edited; the UI did not expose the executable's full path, so the entry was not independently path-proved by the UI.
- Shared private parent and `staging` directory were owner-owned, non-symlinks, mode 0700. The readiness receipt and both protected provider-mutation receipts were absent.
- The bundled Python executable's SHA-256 matched `ac60cfe0268614638d0ffa35f3b0284fc7b3a11482723793455e17eeb278509e`.
- The exact patch in `/tmp/tll-credential-readiness-arming-preview-v1.patch` changed only `CREDENTIAL_READINESS_LIVE_ENABLED`, shared helper `APPROVED_NATIVE_READ`, and their two activation-manifest hashes. It applied cleanly and was committed locally as `f5ef2d19a2cebaf62ddc2753ea507cf65fa9bda3`. All eight other provider-normalization switches and the provider-readonly launcher stayed false. The activation manifest check passed. Ordinary tests were not run while armed.

## Attempt and terminal reconciliation

- Command, invoked **once** from the reviewed local arming commit: `node scripts/staging-provider-credential-readiness-live-launcher.mjs`.
- Launcher result: `PASS`, `category:null`, `elapsedSeconds:1`. No credential value or raw child output was printed.
- Private receipt: `../implementation-state/staging/tll-provider-credential-readiness-v1.json`, run ID `c7db239d-3953-4b1b-8bdb-d07a308b672f`, started `2026-09-24T17:45:06.557Z`, updated `2026-09-24T17:45:06.762Z`. Exact schema and fields passed validation; terminal phase `READ_BYPASS`, sequence 4, outcome `PASS`, category null. It is owner-owned, regular, one link, mode 0600. The phase assessor independently returned `TERMINAL/PASS`.
- Both protected provider-mutation receipts remained absent. The two switches were immediately returned to false. Direct disabled-launcher, activation-manifest and live-boundary checks passed. The three arming paths matched disabled base byte-for-byte, and the disarm was committed locally as `086839dde2e2472edd72d82f8d6a1d0713cbd3a0`; that sibling is clean. Neither arming nor disarming commit was pushed.

## Scope of proof and remaining HOLD

This result proves only that the three retained Keychain items were readable through the exact helper invocation during this bounded local window. It does not test Supabase/Vercel authentication, establish token validity, explain the earlier intermittent helper failure, or justify a second readiness run. Preserve the terminal receipt and both local commits. The credential incident and Stage 3 provider-mutation gate remain OPEN/HOLD until the direct cause or a reviewed deterministic replacement access path is established, independently reviewed and followed by a fresh hosted baseline and separate action-time approval.
