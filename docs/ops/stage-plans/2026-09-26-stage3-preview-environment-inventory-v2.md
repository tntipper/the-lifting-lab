# Stage 3 — one-use Preview setting-name inventory v2

## Why this successor exists

The approved v1 inventory never reached Vercel. Its terminal journal is `FINISHED/READ_UNAVAILABLE`: macOS presented a Keychain permission prompt, and the 10-second helper limit expired. The owner then approved a **separate local-only preflight**, answered the prompt, and proved the fixed Keychain item readable in 4.5 seconds. That diagnostic has its own `FINISHED/READABLE` journal and is disabled again. Neither record may be deleted or replayed.

This v2 changes only the local timing and one-use identity of the same read-only inventory: Keychain command 30 seconds, launcher helper 35 seconds, observation 58 seconds, detached supervisor 70 seconds, v2 proof string, v2 private journal path/schema. The shared process supervisor has a 70-second ceiling, so no shared control was widened. Both code switches remain false in ordinary work. The two fixed GET requests, repository check and name-only assessment are unchanged. This is still **only a setting-name check**, not proof of correct secret values or deployed runtime behaviour.

## Before arming

Verify main branch, commit and working tree; preserve the six unrelated untracked paths. Check both v1 and local-preflight terminal journals, and that the v2 journal `../implementation-state/staging/tll-preview-environment-inventory-v2.json` is absent. Check the two manifests and live-boundary policy while disabled. Verify the Vercel token has not expired without printing it. Independently review the disabled v2 diff and the exact two-switch arming diff, with regenerated activation-manifest hashes. The intended checkout must be the main integration checkout, not a temporary review worktree.

Obtain fresh owner action-time approval for this v2 credential window and one hosted read. Have the owner ready at the Mac to click **Allow** for `/usr/bin/security` and the fixed TLL Keychain item if macOS prompts again. Do not broaden the Keychain item to all applications. Do not create a new token unless the saved one has expired or cannot be used; any new token must be scoped to `the-lifting-lab` and short-lived, and credential entry must be performed privately by the owner.

## One run and closeout

Apply only the reviewed arming diff. Invoke `node scripts/staging-preview-environment-live-launcher.mjs` once. The child claims v2's journal before reading Keychain. It checks the pinned project/repository before reading the effective Preview variable list. Output and journal must contain no token or setting values. An incomplete/uncertain result is a hold, never an invitation to retry. Immediately set both switches false, regenerate/check the manifest, check the live boundary, and preserve the terminal v2 journal. Record missing names/classification gaps or `NAMES_PRESENT` with its limited meaning. No Vercel setting change, deployment, Supabase change, account/cart activation, purchase, customer message or Production change is included.
