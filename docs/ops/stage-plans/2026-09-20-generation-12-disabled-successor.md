# Generation 12 disabled successor and live-launcher design

## Outcome

Prepare a fresh, fully disabled Generation 12 credential package derived from the Generation 11 pattern, plus a dedicated live launcher that uses the phase journal. Bake in Generation 11 interrupted-live ops lessons from the start. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 12 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 11 with Gen 10/11 runtime lessons applied from the start.
- Ordinary Gen 12 transport modules are injected-only: no `runNativeGeneration12CredentialWindow`, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Journal-before-material ordering and `JOURNAL_CLAIM_REJECTED` are present in Gen 12 transport.
- `scripts/staging-generation-12-live-launcher.mjs` is the only module that may define/invoke Gen 12 native live work; it uses `scripts/staging-window-phase-journal.mjs`.
- Optional `scripts/staging-generation-12-journal-watch.mjs` is a read-only observer CLI (not on the ordinary-test native path).
- `npm run check:live-boundaries` passes with Gen 12 coverage; ordinary tests cannot import or call the Gen 12 live launcher.
- Manifest pins Gen 12 artefacts with `nativeTransportEnabled: false`, `generation12Armed: false`, and keeps Gen 10/11 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–11 journal rewrite.

## Gen 11 interrupted-live lessons carried forward

1. Ordinary tests must never call a native launcher; Gen 12 transport therefore contains no callable live launcher.
2. Live execution belongs only in `*-live-launcher.mjs`, invoked directly in its own **long-lived** process after independent review of an arming diff that is **not** part of this stage.
3. Phase budgets are real: VERCEL_STAGE alone up to 660s; CONNECTION_VERIFICATION up to 420s; plan ~45 minutes wall. Short-lived remote-shell/`nohup` that dies with the parent session is forbidden (Gen 11 root cause).
4. Observers must not infer a stall from silence, missing children or sockets; they must read the phase journal deadline via a **separate** read-only process (`assessStagingWindowProgress` / journal-watch).
5. Never kill or reconcile while `assessStagingWindowProgress` reports `ACTIVE_WITHIN_PHASE_BOUND`.
6. Exclusive dispatch journal is claimed before material generation.
7. Generation 11 remains consumed (`INTENT_RECORDED`); Gen 12 uses a new package id and window UUID. Replay of Gen 10/11 is forbidden.

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-12-credentials/v1` |
| Window ID | `6d4c5ed4-08a3-4d20-b580-cd03ab000e83` |
| Role predecessor | Gen 10 / `04e1b5da-b3e1-430b-8247-caf1d46faa5a` / expires `2026-09-20T21:08:17.000Z` (Gen 11 never reached DATABASE_DISPATCH; roles remain Gen 10 retired) |
| Superseded attempt | Gen 11 / `56ff2757-3e34-4cf0-a1dc-40999a713874` / `INTERRUPTED_RECOVERED_INTENT_LOCKED_NO_REPLAY` / replay forbidden |
| Credentials | `scripts/staging-generation-12-credentials.mjs` |
| Transport | `scripts/staging-generation-12-transport.mjs` |
| DB transport | `scripts/staging-generation-12-database-transport.mjs` |
| Keychain | `scripts/staging-generation-12-keychain.py` |
| Recovery | `scripts/staging-generation-12-recovery.mjs` + SQL under `config/` |
| Live launcher | `scripts/staging-generation-12-live-launcher.mjs` |
| Journal watch | `scripts/staging-generation-12-journal-watch.mjs` (optional read-only observer) |
| Tests | `tests/staging-generation-12-*.test.mjs` (+ boundary/manifest extensions) |
| Manifest key | `generation12Successor` |

Assumption requiring evidence before any future arming: recovered runtime roles retain retired Gen 10 markers and `VALID UNTIL` equal to the Gen 10 journal expiry above (Gen 11 interrupt left provider state clean without installing Gen 11 credentials). If a later read-only baseline disagrees, stop and revise before any arming diff.

## Explicit stop before arming

This stage ends when the disabled package, live launcher, journal-watch, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff** (a separate change that flips native/Keychain gates). This PR must not contain that diff.

A later approved live attempt must:

1. Run `scripts/staging-generation-12-live-launcher.mjs` once, directly, in a long-lived process that covers the full phase budgets (~45 minutes wall).
2. Monitor only via the phase journal and its phase-specific deadlines from a separate read-only process (journal-watch / `assessStagingWindowProgress`).
3. Never kill while status is `ACTIVE_WITHIN_PHASE_BOUND`.
4. Stop after one attempt; reconcile; disarm; never run `npm test` while armed.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–11 journals or recovery evidence.
- No production Supabase `wrhgscovsgsudtedbljr`; staging only `qdmvngjwkcsilzmqksme`.
- No purchases, emails or supplier orders.
- No merge to `main`.

## Verification order

1. Focused Gen 12, boundary and phase-journal tests.
2. `npm run check:live-boundaries`.
3. Manifest `--check`.
4. Disabled launcher CLI returns `NATIVE_TRANSPORT_DISABLED`.
5. Full `npm test`, typecheck, lint.
6. Diff review against this plan; commit; open PR into `codex/tll-integration`.
