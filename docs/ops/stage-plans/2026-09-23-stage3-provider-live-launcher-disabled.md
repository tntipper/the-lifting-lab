# Stage 3 provider normalization — disabled live launcher

## Outcome and acceptance

Prepare a dedicated staging-only launcher that can later supply the reviewed session with exact concrete read bindings, the official provider update port, a bounded provider-owned Keychain helper and both durable journals. The launcher must return `PROVIDER_NORMALIZATION_LIVE_DISABLED` before loading effectful dependencies while its gate is false. The future arming diff must be small and independently reviewed. This unit permits zero hosted requests, zero credential reads and zero provider updates.

## Starting state and exclusions

At `eac7cd3`, the injected session and its dependencies have independent GO for disabled continuation, but hosted arming remains HOLD. The older hosted-baseline Keychain helper has the three required selectors but is coupled to its consumed observer's manifest; the provider phase and intent journals are separate, consumed-once files. The current staging provider is known enabled with a JWKS URI; the Ready Preview is behind local HEAD and does not prove the custom manifest value. These hosted observations are historical and cannot authorize a write. Preserve unrelated untracked files and consumed journals. Exclude Production, purchases, supplier orders, customer messages, deployments and public flags.

## Files and pre-mutation checks

Change only the new launcher and dedicated provider Keychain helper, this plan, the live-boundary checker, activation-manifest source pins and generated manifest, and a focused source-policy test for the new gate. Before edits, verify branch/HEAD/status, existing helper selectors and gates, concrete factory signatures and the project stage protocol. No external system is changed. During this disabled unit, inspect the launcher source, invoke its disabled CLI once, run the full disabled suite, typecheck, lint, both manifest checks, live-boundary and diff checks.

## Execution design

The false launcher gate precedes dynamic imports, Keychain subprocesses, journals and fetch. On a future approved run, check activation-manifest freshness before session invocation; construct the dedicated phase and intent journals at their fixed paths; use only the three fixed selectors in the provider-owned helper and copy/wipe each output Buffer; use `globalThis.fetch` solely through the fixed-target Supabase/Vercel/surface factories and official provider port. The session starts the phase journal before the first credential read and supplies one AbortSignal through all read/update work. No caller-supplied target, URL, credential selector, fetch or journal path is accepted.

The new helper remains false in this unit, as does the older helper and observer. A future reviewed arming patch would enable only the new launcher and its own helper. The boundary checker must accept this dedicated reviewed successor phase journal, reject launchers without one and reject the new launcher gate when armed during ordinary tests.

Initial independent review returned HOLD for two concrete faults: the boundary checker did not recognize the new live gate, and reusing the older helper forced the new launcher to check the hosted-baseline manifest, which requires that helper gate to match the consumed observer gate. A fixture test now proves gate detection. A dedicated disabled provider helper and activation-manifest pin isolate future arming from the older observer; re-review is required.

## Failure, review and later action gate

Malformed or stale manifest, missing helper output, unexpected response, existing journal, timeout, uncertain update or cleanup failure must fail closed with fixed output. Never retry a failed or uncertain dispatch. After the disabled checks, obtain independent review of the exact launcher/read/update boundary before any arming proposal. The later external unit requires a fresh read-only staging baseline, exact provider/Admin state and Preview identity, action-time credential/permission authorization, a reviewed minimal arming diff, one maximum attempt, separate read-only reconciliation and disarm. If any precondition differs, stop and revise this plan before a credential window. Record checks and next action in `.agent/HANDOVER.md`.

## Disabled checkpoint

The corrected independent review returned GO to commit the disabled launcher/helper, with hosted arming still HOLD. The reviewer verified the prior shared-helper coupling and missing live-gate detection are corrected and found no further actionable boundary issue. The launcher CLI returned only `PROVIDER_NORMALIZATION_LIVE_DISABLED`; focused boundary/manifest tests passed 22/22 and the full disabled suite passed 2,357/2,357. Typecheck, both manifest checks, live-boundary and diff checks passed; lint had zero errors and 20 existing warnings. No journal, credential read or hosted call occurred.
