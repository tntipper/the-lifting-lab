# Stage 3 — one-use Preview setting-name inventory

## Purpose and present state

Determine which required Vercel settings apply to the `codex/tll-integration` Preview without returning or printing their values. General Preview settings are inherited by the branch; branch-specific settings override them. The disabled code checks the pinned GitHub repository first, then obtains one project-environment listing, excludes unrelated targets, and reports missing names or secret-classification gaps. The API response may contain value fields transiently in process memory; the reader discards them from its result and caps/wipes the raw response buffers. `NAMES_PRESENT` means **only** that required names and classifications were observed; it does not prove values, runtime flags, provider state or sign-in.

At local commit prepared on 26 September, both gates remain false: `STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED` in `scripts/staging-preview-environment-live-launcher.mjs` and `APPROVED_PREVIEW_ENVIRONMENT_READ` in `scripts/staging-preview-environment-keychain.py`. The one-use journal path is `../implementation-state/staging/tll-preview-environment-inventory-v1.json`; any existing file at that path forbids replay. No credential or hosted request has been made for this inventory.

## Before a real read

1. Verify the branch, HEAD, working tree, activation manifest and live-boundary check. Preserve the six unrelated untracked paths listed in `.agent/HANDOVER.md`. Check that the new journal does not exist; if it does, inspect it read-only and do not rerun.
2. Independently review the exact source and a minimal arming diff, including both false-to-true assignments and the regenerated activation manifest. The read-only worker must keep its 45-second operation limit, 60-second detached supervisor, two fixed Vercel GETs, journal-before-Keychain order, and no mutation methods.
3. Obtain a fresh, project-scoped Vercel API token with a short expiry and place it only in the fixed Mac Keychain selector `TLL Hosted Baseline Vercel API` / `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4`. Confirm the selector can be read by the approved local helper without displaying the token. Do not paste the token into chat, logs or source files. A previously expired token cannot be assumed usable.
4. Obtain separate owner action-time approval for this new credential window and the exact one-use, read-only invocation. Earlier approvals and consumed journals do not cover this run.

## One approved run and closeout

After all preflight checks pass, apply only the reviewed arming diff, regenerate the pinned manifest, and invoke the dedicated launcher once. Its child claims the private journal before Keychain access. It checks the Vercel project and linked GitHub repository, then reads only the environment-variable list. It returns required setting names and classifications, never values. A missing, ambiguous, incomplete or oversized response is a hold, not evidence of absence. The parent compares the returned name-only result with the journal digest. It never retries.

Disarm both gates immediately after the one run, regenerate and verify the manifest, then preserve the terminal journal. Record only the result and whether the fixed Preview settings appear present, missing or misclassified. If the process times out or the result is uncertain, stop and reconcile through a newly reviewed read-only plan; do not delete or replay the journal. Do not change Vercel settings, Supabase, account/cart activation, customer data, Production, or purchases in this window. A later actual Preview build must still prove compiled and runtime flags.
