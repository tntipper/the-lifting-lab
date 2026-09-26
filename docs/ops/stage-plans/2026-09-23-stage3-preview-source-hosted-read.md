# Stage 3 — one-shot Vercel project and Preview source observation

## Outcome and acceptance

Prepare a disabled one-shot reader that makes at most three fixed Vercel GETs: project link, Preview alias and that alias's deployment. It must compare the linked and deployed repository IDs with `1264363509`, return a redacted source receipt, and leave a durable secret-free one-use journal. A successful read can establish the current Preview source; it cannot prove deployed bytes from custom metadata or authorize sign-in/deployment.

## Starting state and exclusions

Local branch `codex/tll-integration` is at `9e9b4b7`; the only working-tree extras are the pre-existing unrelated untracked iCloud copies and `implementation-state/`. The fixed GitHub remote branch still reads `0f8027288ac52667089a094b73a2c03ff63ca916`, behind local HEAD. The previous visible Vercel branch Preview was at `536d36a`; this must be rechecked through the new read. Existing project and source bindings are injected-only and reviewed. All live gates remain false. This stage excludes push, deployment, Production, Supabase, Shopify, provider settings, purchases, orders and customer communication.

## Disabled preparation

1. Add an isolated Vercel-only Keychain selector, disabled live launcher, bounded orchestration and a distinct one-use mode-0600 phase journal. Never arm the broad hosted-baseline reader or bypass selector. The launcher must remain false until a separate arming diff.
2. The launcher checks pinned manifest and journal state before Keychain access. The journal records launch, project read, source read and terminal result. A failure or uncertain acknowledgement consumes the journal. The coordinator owns one abort deadline, wipes the token and disposes both bindings, even on failure.
3. Tests inject credentials, transport, journal and time. Verify exact request order, repo/branch/target mismatch, non-200/redirect/body limits through existing bindings, immediate and mid-read cancellation, cleanup failure, replay and no credential read while disabled. Ordinary tests may not import the live launcher; inspect its source statically where needed.
4. Independently review the complete disabled read/credential/journal boundary. Run focused tests, full disabled suite, typecheck, lint, both manifests and live-boundary check, then commit the disabled result.

## Separate hosted arming gate

Before any hosted call, capture current repo/remote/manifest state and Vercel project identity from a fresh read-only baseline, confirm a valid one-hour scoped Vercel token exists or create one with action-time owner approval, inspect the exact small arming diff independently, commit it, and run the launcher once directly. No automatic retry. Immediately disarm, verify the disabled boundary, and reconcile from a separate read-only process if the journal is uncertain. The remote token may expire naturally per the owner's previous preference. Record the returned project link, deployment source, alias and manifest-claim status without logging token or provider payload.

## Stop conditions

Stop on missing/expired credential, journal conflict, source or repository mismatch, unexpected environment, response drift, timeout, untrusted metadata, or cleanup uncertainty. Do not treat an absent manifest claim as zero or proof. Do not publish the branch to clear the source lag in this read-only stage.

## Disabled checkpoint

The isolated Keychain selector, false-gated launcher, injected observer and distinct one-use phase journal are implemented without hosted access. Independent review found that repository-ID drift was checked too late; it now stops after the project GET before alias/deployment reads. Review also found a synthetic cleanup-test fixture that failed before reaching cleanup; the fixture and a successful control were corrected. Final independent review: GO for disabled preparation, hosted arming still HOLD. Focused 9/9 and full 2,380/2,380 tests passed; typecheck, both manifest checks, live-boundary and diff checks passed; lint has zero errors and the same 20 warnings. No credential was read and no Vercel request was made.

## One-run closure

After fresh owner approval, the exact two-gate and two-hash candidate was committed at `de0283c` and run once. The result was `OBSERVED` with `CURRENT_SOURCE_UNPROVEN`: the fixed alias still points to source `536d36a` and deployment metadata has no application-manifest hash. The mode-0600 journal is consumed. Gates were immediately disarmed at `0676638`, byte equality with pre-arm files and both manifests/live-boundary were verified, and the temporary Keychain app allowance was removed. The token will expire naturally. Full receipt, journal hash and independent UI postflight are in `docs/ops/evidence/2026-09-23-preview-source-read-result.md`. No retry or deployment occurred; the next stage is an exact-source Preview deployment plan, not another observation.
