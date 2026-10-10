# Generation 19 disabled successor (Phase 1)

## Outcome

Prepare a fresh, fully disabled Generation 19 credential package and dedicated live-launcher stack derived from the Generation 18 tip (post–PR #43). Inherit Gen 18’s **SCRAM** derivation, **bridge own_probe** (`register` + `{}` + expected `error`), **zero-sessions drain** (**30s × 5** — do not weaken), **management-API non-201 body classification**, secret-free **`zeroSessionsAttempts`**, and **entry preflight failureStep evidence** (entry RAISE allow-list + `failureStep: preflight` from #43) from day one. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

Also ship **required prevention**:

1. Fix Gen 17 recovery successor pin (was Gen 16 leftover) and regenerate Gen 17 recovery SQL artefacts.
2. Recovery-pin regression test (Gen 15–19).
3. Pre-arm gate + checklist refusing Gen 19 arming without predecessor retirement proof **or** reviewed Gen 17 cleanup path listed.

## Acceptance criteria

- Generation 19 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 18 tip helpers (`postManagementQuery`, entry + zero-sessions allow-lists, `classifyEntryBaselineFailure`, `classifyZeroSessionsFailure`, `verifyGeneration19ZeroSessionsAfterPoolerDrain`).
- Gen 17 recovery `successor` is `{ generation: 17, windowId: 5728d807-… }` (before: Gen 16 / `313afec9-…`). Gen 18 recovery remains Gen 18 / `44e3fff5-…`. Gen 19 recovery pins Gen 19 window.
- `tests/staging-generation-recovery-pin-contract.test.mjs` fails if Gen N recovery pins the wrong generation’s window.
- `assertGeneration19PreArmReady()` refuses arming without retirement evidence or the reviewed cleanup doc listing Gen 17 targets.
- Ordinary Gen 19 transport modules are injected-only: no native credential window runner, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Manifest pins Gen 19 artefacts with `nativeTransportEnabled: false` / `generation19Armed: false`, keeps Gen 17–18 disarmed, Gen 18 `ENTRY_BASELINE_FAILED_NO_REPLAY` (no replay).
- No arming diff, no live process, no hosted mutation, no Gen 6–18 journal rewrite, no Gen 17/18 cleanup execution in this PR.

## Lessons baked in from day one

| Source | Lesson | Gen 19 enforcement |
|--------|--------|--------------------|
| Gen 18 live ENTRY_BASELINE_FAILED / mgmt 400 (PR #43) | Gen 17 never retired; Gen 17 recovery pinned Gen 16; entry RAISE was opaque | Fix Gen 17 recovery pins; pre-arm gate; inherit entry allow-list + `failureStep: preflight` |
| Gen 17 live zero_sessions / runtime_sessions_remain | Drain budget vs pooler idle TTL | Inherit `30_000` × `5` + `zeroSessionsAttempts` |
| Gen 16/17 mgmt non-201 mapping | Drain bodies; promote allow-listed phrases | Clone tip `postManagementQuery` |
| Gen 14 bridge own_probe | `register`+`{}`+`error` | Shared verifier unchanged |
| Gen 13 SCRAM | Projected passwords only | Transport derives from `projection.passwords` |
| Gen 11/12 interrupt | Short shell / nohup | Long-session contract + run-live-once + journal-watch `--follow` |

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-19-credentials/v1` |
| Window ID | `51809dd4-bd4b-44c7-8609-7dd8ca063679` |
| Role predecessor | Gen 17 / `5728d807-701a-486b-a8c5-34bf89238275` (Gen 18 never dispatched; roles remain Gen 17) |
| Attempt predecessor | Gen 18 / `44e3fff5-5dff-4183-af6b-3cdfb367f1af` (ENTRY_BASELINE_FAILED_NO_REPLAY) |
| Predecessor expiresAt | `2026-09-21T09:31:04.000Z` — Gen 17 dispatch journal |
| Entry baseline | Expects `runtimeGeneration: 17` (Gen 17 retired inert runtime after correct cleanup) |
| Staging project | credentials `PROJECT_REF` only (`qdmvngjwkcsilzmqksme`); production excluded forever |
| Manifest key | `generation19Successor` |
| Status | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` |

## Mint checklist — recovery pins (required)

When minting Gen N:

1. Set recovery `successor = { generation: N, windowId: <this WINDOW_ID> }`.
2. Regenerate recovery SQL artefacts.
3. Update recovery test asserts to **this** generation (never leave N−1 pins).
4. Run Gen 15–N recovery-pin regression.

## Explicit stop before arming

This stage ends when the disabled package, prevention fixes, pre-arm gate, tests and documentation are committed. Phase 2 requires independent arming review **and** predecessor retirement proven or Gen 17 cleanup executed under separate approval. This PR must not contain the arming diff or live cleanup.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–18 journals.
- No production Supabase; staging project only.
- No Gen 11–18 replay; Gen 18 stays disarmed.
- No arming diff; no Gen 17 cleanup execution in this PR.

## Verification order

1. Focused Gen 19 credentials/transport/DB/recovery/long-session/evidence/zero-sessions-drain + recovery-pin + pre-arm + boundary + manifest tests.
2. `npm run check:live-boundaries`.
3. Manifest regenerate / pin check.
4. Disabled launcher CLI returns native-disabled without long-session env.
5. Diff review against this plan; commit; open PR into `codex/tll-integration`.
