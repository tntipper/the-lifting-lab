# Stage 3 REST broker rotation: one-run preparation

**Status: completed for this one-run staging rotation.** The owner separately approved and the independently reviewed launcher ran once. The result, separate read-only reconciliation, consumed journals and clean disarm are in `docs/ops/evidence/2026-09-25-stage3-rest-broker-rotation-result.md`. This plan did not authorise account/cart activation, customer messaging, purchases, deployment or production change. The next gate is a separately planned staging sign-in journey.

## Intended result

In the staging project `qdmvngjwkcsilzmqksme` only, create one matching broker secret in the pinned Vercel Preview branch and Supabase Edge secrets, make at most one official custom-provider update, then verify the provider and both secret names. Account/cart controls remain off. A failure or uncertain response is recorded once and assessed by the separate read-only recovery path; it is never retried under the same journals.

## Current local starting state, verified 25 September

- Repository `codex/tll-integration` at `17bbcfeec57a997464f725aa8e7ec2020a961114`; tracked files clean. The remote branch still points to `abd5a5258dd1072daf83a4447ce7110465f445e1`.
- The REST launcher and the rotation Keychain helper each have one literal false gate. Activation-manifest check and ordinary live-boundary check pass. The launcher directly returns `STAGING_BROKER_REST_LIVE_DISABLED`.
- The new phase and rotation journal paths are absent. Historical/consumed journals and six unrelated untracked paths must remain untouched.
- The final disabled-source suite passed 2,670 tests with two intentional skips; typecheck and lint passed with 20 existing warnings. Independent review returned GO for disabled preparation after the shared run-ID and boundary-rule corrections.
- **Dashboard checks, 25 September:** the owner signed into the correct Chrome profile. Supabase `tll-staging` lists `custom:tll-staging-subject-broker-v1` as **Disabled**. Its edit dialog retains the pinned JWKS URI, authorization URL, token URL, userinfo URL and client ID. The Edge custom-secret table lists the two staging CA names and `TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED`; it does **not** list `TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET`. No value was opened or changed. The Vercel project lists the pinned Preview deployment as Ready/Latest, tied to source `abd5a5258dd1072daf83a4447ce7110465f445e1`; a project-variable search for the broker secret name returned no result. These UI observations are partial and will expire as a pre-run baseline. They do not establish exact provider fields, a complete API secret inventory, database controls or protected Preview flags.
- **Strict hosted baseline PASS at 17:31 UTC, 25 September:** the reviewed one-use read-only check accepted the pinned database, full safe-held provider, both broker-secret-name inventories and protected Preview account/cart flags. The terminal receipt and limits are in `docs/ops/evidence/2026-09-25-stage3-prearm-readonly-v1-result.md`. This is the pre-arm proof for the next diff; stop and reassess if source, hosted state or token validity changes before execution.

## Evidence required before an arming diff

1. Confirm the remote Git branch still points to the pinned deployed source and Vercel still identifies the protected Ready Preview `dpl_9CFPQG6JChoGrkWidhh73BY1Qj1b` and its pinned immutable URL. Stop on movement or source mismatch; prepare a separate publication plan if required.
2. Obtain a fresh official read-only Supabase staging database control receipt: controls off, zero runtime sessions, expected migrations/roles and no active execution edge. Confirm the broker Edge secret name is absent.
3. Read the exact official staging provider and verify disabled status, retained JWKS address, client/settings and no drift. Confirm the Vercel Preview broker environment name is absent.
4. Read the protected Preview readiness route at alias, immutable URL and alias again, checking deployment identity and all four private/public account/cart flags are false. Browser UI alone is insufficient for the protected runtime proof.
5. Confirm both new journals remain absent, both gates remain false, the generated activation manifest matches source, the pinned Python executable exists, and no production target can be selected by the launcher.

These checks are read-only but require a separately approved credential window. Vercel's token list confirms the 24 September one-hour token expired. On 25 September the owner created a new token limited to `the-lifting-lab` for one hour and saved it in the fixed Keychain item's protected password field. A metadata-only read confirmed the item was updated and Comments remain empty; token validity was not yet tested. The existing Supabase CLI and Preview-bypass Keychain items also require a fresh, bounded read approval. A dashboard view is useful context, not a substitute for an official API or protected runtime receipt.

**Read-only pre-arm runner invoked once:** `/tmp/tll-stage3-prearm-readonly-20260925.mjs` at SHA-256 `205f0416d314ec1986fbf91da6da5c6400022e187d69f8a583ab683745bf9d92`. It reused the pinned read-only staging bindings, checked the complete accepted safe-held provider fields, and wrote a private one-use receipt at `../implementation-state/staging/tll-prearm-readonly-20260925-v1.json` before hosted requests. An independent reviewer returned GO for this exact script after correcting incomplete provider validation and the journal's crash durability; its focused provider checks passed 19 cases. The receipt is now terminal PASS and consumed. It does not approve rotation or activation.

## Proposed arming and execution sequence, not yet authorised

After the complete fresh baseline, create an isolated checkout from the exact disabled commit. Prepare the smallest diff: the launcher switch `false → true`, the Python helper switch `False → True`, and the resulting activation-manifest source hashes only. Do not change endpoints, selectors, provider fields, journal paths or deadlines. Compare the diff with this plan and have it independently reviewed. Keep ordinary tests in the disabled checkout; never run them with either gate enabled.

With separate action-time owner approval for this exact window, apply and commit the reviewed diff, run the dedicated launcher **once** under its 10-minute parent deadline, and preserve its output plus both mode-0600 journals. The worker writes the phase before acquiring credentials and before every remote effect. Any stale phase, missing acknowledgement, unexpected provider response, changed baseline, failed Keychain read, or timeout ends the attempt without replay.

Use a separate read-only process to reconcile the exact provider, both secret names, database controls and protected Preview after the run. If a write may have succeeded without an acknowledgement, do not automatically remove secrets or retry; classify the state as requiring reconciliation. Disarm both switches, regenerate/check the manifest, run disabled-boundary checks, commit the outcome and update `.agent/HANDOVER.md`. Account/cart activation remains a later, separate gate.
