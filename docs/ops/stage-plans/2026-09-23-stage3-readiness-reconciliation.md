# Stage 3 readiness reconciliation after v8

## Outcome and acceptance

Determine the smallest safe route from the consumed v8 observation to the remaining Stage 3 hosted sign-in journey. Prove the disabled code and journal baseline, identify which known HOLDs require remediation, and record an exact preflight/activation sequence. This unit is complete when it has a checked repository/journal receipt, focused test results, a read-only hosted state where existing access permits, and a specific GO/HOLD decision. A successful offline test or DNS/email signup does not close Stage 3.

## Boundary and starting evidence

The live v8 journal is terminal `OBSERVATION_FAILED`, hash `49ac5c4e6fe22fb384a363a24dbc46b308a37b81e28503fbb8767ec8a10b83fd`, mode 0600; it cannot be replayed. The direct `sourceless: true` merge defect has a disabled correction and negative regression tests. Last hosted read showed an enabled/JWKS-configured staging provider and absent application-manifest proof, which would produce HOLD even if the observer now composes. No one-run credential window is open. The live launcher and Keychain helper remain disabled. Preserve unrelated untracked files.

## Exclusions

No new observer generation, arming, credential creation, Keychain permission change, provider edit, migration, deployment, public-store opening, customer email, supplier order or purchase in this unit. Read-only staging UI/CLI inspection may use an existing signed-in session only. Never use production Supabase. Do not expose secret values or customer data in evidence.

## Pre-checks and evidence

1. Record repository identity, branch, HEAD and working tree; verify v8 journal mode/hash and native gates false.
2. Run the focused hosted composition/binding/session tests, both generated-manifest checks, and the live-boundary check while disabled. Run the full suite only if the focused tests or a code change warrants it; prior full suite is recorded in the handover.
3. If existing authenticated UI permits, inspect only the exact staging provider state, Vercel Preview project/deployment identity and application-manifest presence; stop if identity differs or sign-in/credentials are requested.
4. Separate observations from historical evidence. Identify the minimum required state changes and their owner, review, rollback and post-change acceptance.

## Failure and stop conditions

Stop on a journal mismatch, enabled gate, staging/production identity ambiguity, unexpected hosted mutation prompt, unclassified provider response, or need for a fresh credential. Do not retry v8. Correct a failed offline check only after diagnosing its cause and updating this plan. No new generation may be prepared until the historical incident decision and exact project/deployment composition preflight receive independent review, a fresh journal is selected, and a separate credential/action-time gate is met.

## Next externally effective sequence (not authorized by this document)

Before any hosted run, refresh the staging database/provider/secret/surface and immutable Vercel Preview baseline; record categorical `sourceless`, exact project/deployment repository/provider/branch/commit agreement, and complete application-manifest evidence. Plan any provider disable/JWKS correction and manifest publication separately, with independent review and rollback. Only when a useful expected outcome is defined should a new one-shot observer be designed, reviewed, armed and invoked under `project-stage-execution-protocol.md`. Then verify the owned-email Sign In → Shopify → unified account/cart/orders → logout journey on that same immutable Preview, stopping before purchase.

## Review, maximum attempts and handover

This unit has zero hosted write attempts and zero live launcher invocations. Review its exact evidence and decision before moving to a separate mutation plan. Update `.agent/HANDOVER.md` with actual results, unresolved gates and the single next action. Preserve all journals and untracked files.

## Executed evidence and decision (2026-09-23)

- Repository: `codex/tll-integration` at `2094251` before this document, with only the preserved unrelated untracked copies/journal-watch/state directory. The v8 journal remained mode 0600 with the recorded SHA-256. Both native flags were false. Focused hosted composition, Vercel binding and session tests passed **47/47**; both generated manifest `--check` commands and `check:live-boundaries` passed with zero violations. No code changed, so the already-recorded full disabled suite was not repeated.
- Existing signed-in Supabase dashboard at the exact staging project `qdmvngjwkcsilzmqksme` showed custom provider `custom:tll-staging-subject-broker-v1` **ENABLED**. Its read-only edit view showed a configured JWKS URI. The edit view was closed without saving. This independently reconfirms two known HOLDs. The dashboard's `main PRODUCTION` label describes this project's primary branch; it is not the separate production project `wrhgscovsgsudtedbljr`.
- Existing signed-in Vercel dashboard showed the `the-lifting-lab` project's `codex/tll-integration` Preview deployment `4M6P7P6rbG9w2Q9kC6y65rRzWB3V` Ready, sourced from `536d36a515ad39449338748b5739b0dcdedf8256`. The local repository is now at `2094251`; therefore that immutable Preview does **not** represent this tip. The dashboard does not expose the exact `meta.tllManifestSha256` value needed by the observer, so its absence remains a historical API observation, not a newly verified UI fact.
- Source inspection found that the observer reads `meta.tllManifestSha256` on the deployment API record, but the repository contains no concrete writer for that metadata. This is a design/operational gap, not a parser defect. [Vercel's CLI documentation](https://vercel.com/docs/cli/deploy) supports adding custom metadata with `--meta` at deployment creation and warns that branch binding and Preview variables must be verified. Auto-Git Preview deployments do not automatically establish TLL's custom manifest proof. A CLI/API deployment plan must preserve the exact Git source, branch, project, environment, alias and build-time variables before it is considered.

**Decision: HOLD on a new observer.** A v9 diagnostic now would predictably return at least `provider_enabled`, `provider_jwks_configured`, and likely `application_manifest_evidence_absent`; repeating a credential window solely to re-observe those facts is not useful. The next coherent unit is a separately reviewed **staging remediation and deployment-evidence design**: define how to retire the enabled/JWKS provider safely, how to produce and verify a manifest-bound immutable Preview without accidental production deployment or branch/env drift, and how to capture exact hosted values without exposing secrets. Only after those are implemented and independently reviewed should a single fresh read-only baseline and owned-email journey be planned. No provider, Vercel or Supabase mutation occurred here.
