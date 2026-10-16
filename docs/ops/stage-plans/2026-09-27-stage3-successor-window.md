# Stage 3 successor window after the Gen23 baseline HOLD

## Starting evidence

- Protected Preview source `191b5a24f5a3c3688e687500ba42f8774cc4cd93` is Ready at deployment `dpl_2Bexi74bn7mqZVoCMFJF2zPoP4Hz`. Unauthenticated access redirects to Vercel login. Account, cart and checkout handoff controls read OFF.
- The previous Gen23 whole-route record is `HOLD` at `baseline`, `nextIndex:0`; it is preserved at `../implementation-state/staging/tll-generation-23-whole-route-v1.json` with SHA-256 `b996d3f1dc74d6c48e9b10eada64e7ec057cee8c0425b87f5693e870a32b0be3`. No other Gen23 phase record exists.
- Read-only post-run observations found five database logins retired/passwordless, zero sessions, five database controls OFF, the custom provider disabled, and both broker Edge endpoints returning 503. No customer journey was dispatched.
- The duplicated Vercel `sourceless:false` assumption was fixed in the disabled source. The full local suite, focused route tests, typecheck and independent review passed before staging publication.

## Goal and constraints

Run the complete protected owner journey once with the owner present, with no purchase or production change, and prove the Preview, provider, Edge functions and temporary database accounts are held afterward. A failure or uncertain reply stops the window; it never authorises a replay. The consumed v1 record remains immutable.

## Ordered preparation

1. Give this successor a new random window ID and **v2 paths for every one-use record**, while retaining the existing Generation 23 protocol and its Gen22 database predecessor. The first attempt never installed Generation 23 database credentials. The parent must verify the exact prior v1 HOLD file and absence of all other v1 records before it can inspect unused v2 records. Preserve all v1 files. Unit tests must reject a missing, altered or different prior record and any pre-existing v2 record.
2. Use the **same actual live API response shapes** in the networkless whole-route rehearsal: Vercel Git-linked project with `sourceless:true`, a Git-triggered deployment without custom manifest metadata, retained broker secret, disabled provider and the current 38-row branch environment inventory. Confirm the first baseline phase passes through the same adapter the hosted route will use. Test loss of reply and containment before any later write.
3. Recheck every downstream interface once as a contract matrix: settings and secret IDs/types/branch, Supabase database operator/role shape, provider fields, enabled and held Preview source identity, variant price, owner browser controls and checkout GET-only boundary. Add only tests that would catch a concrete mismatch; do not remodel working components.
4. Regenerate manifests, run focused and full checks, a real PostgreSQL lifecycle and the supervised networkless whole process, then obtain independent review of the complete disabled change. Commit it with every activation switch OFF.
5. Obtain separate approval for publishing that exact disabled commit to the protected staging branch. Verify the Ready immutable deployment, source SHA, protection, account/cart/checkout OFF, provider/Edge/database held state and unused v2 records.
6. Before any arming, run a new bounded **read-only check of the actual whole-route baseline adapter**, using the same live project and provider response shapes without consuming a v2 journal. This check must pass before a new arming patch or activation approval. Its credentials must remain private and its result must contain no secret values.
7. Review the exact one-hour local arming diff, set a fresh expiry with at least 45 minutes remaining, obtain separate action-time owner approval, and run the parent once with the owner at the Mac. No retry if it returns HOLD or an uncertain terminal. Verify all held controls and retired roles afterward, preserve all records, and disarm the local checkout.

## Risk controls

- The old HOLD record proves only the order reached; it is paired with fresh hosted read-only proof before treating the environment as safe.
- The successor changes journal paths and window ID only; every fixed service target, product/price expectation, no-purchase browser boundary and shutdown order must remain intact.
- A stale token, Keychain denial, unexpected API response, source drift, partial write or lost reply closes the window. Reconciliation is read-only; a further attempt requires another reviewed identity and records.
