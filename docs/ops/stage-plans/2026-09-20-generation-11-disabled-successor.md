# Generation 11 disabled successor and live-launcher design

## Outcome

Prepare a fresh, fully disabled Generation 11 credential package derived from the Generation 10 pattern, plus a dedicated live launcher that uses the phase journal. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 11 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 10 with Generation 10 runtime-diagnosis corrections applied from the start.
- Ordinary Gen 11 transport modules are injected-only: no `runNativeGeneration11CredentialWindow`, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Journal-before-material ordering and `JOURNAL_CLAIM_REJECTED` are present in Gen 11 transport.
- `scripts/staging-generation-11-live-launcher.mjs` is the only module that may define/invoke Gen 11 native live work; it uses `scripts/staging-window-phase-journal.mjs`.
- `npm run check:live-boundaries` passes with Gen 11 coverage; ordinary tests cannot import or call the Gen 11 live launcher.
- Manifest pins Gen 11 artefacts with `nativeTransportEnabled: false` and keeps Gen 10 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–10 journal rewrite.

## Gen 10 root-cause lessons carried forward

1. Ordinary tests must never call a native launcher; Gen 11 transport therefore contains no callable live launcher.
2. Live execution belongs only in `*-live-launcher.mjs`, invoked directly in its own process after independent review of an arming diff that is **not** part of this stage.
3. Observers must not infer a stall from silence, missing children or sockets; they must read the phase journal deadline.
4. Exclusive dispatch journal is claimed before material generation.
5. Generation 10 remains consumed (`INTENT_RECORDED`); Gen 11 uses a new package id and window UUID. Replay of Gen 10 is forbidden.

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-11-credentials/v1` |
| Window ID | `56ff2757-3e34-4cf0-a1dc-40999a713874` |
| Predecessor | Gen 10 / `04e1b5da-b3e1-430b-8247-caf1d46faa5a` / expires `2026-09-20T21:08:17.000Z` |
| Credentials | `scripts/staging-generation-11-credentials.mjs` |
| Transport | `scripts/staging-generation-11-transport.mjs` |
| DB transport | `scripts/staging-generation-11-database-transport.mjs` |
| Keychain | `scripts/staging-generation-11-keychain.py` |
| Recovery | `scripts/staging-generation-11-recovery.mjs` + SQL under `config/` |
| Live launcher | `scripts/staging-generation-11-live-launcher.mjs` |
| Tests | `tests/staging-generation-11-*.test.mjs` (+ boundary/manifest extensions) |
| Manifest key | `generation11Successor` |

Assumption requiring evidence before any future arming: recovered Gen 10 roles retain retired Gen 10 markers and `VALID UNTIL` equal to the Gen 10 journal expiry above. If a later read-only baseline disagrees, stop and revise before any arming diff.

## Explicit stop before arming

This stage ends when the disabled package, live launcher, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff** (a separate change that flips native/Keychain gates). This PR must not contain that diff.

A later approved live attempt must:

1. Run `scripts/staging-generation-11-live-launcher.mjs` once, directly, in its own process.
2. Monitor only via the phase journal and its phase-specific deadlines from a separate read-only process.
3. Stop after one attempt; reconcile; disarm; never run `npm test` while armed.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–10 journals or recovery evidence.
- No production Supabase `wrhgscovsgsudtedbljr`; staging only `qdmvngjwkcsilzmqksme`.
- No purchases, emails or supplier orders.
- No merge to `main`.

## Verification order

1. Focused Gen 11, boundary and phase-journal tests.
2. `npm run check:live-boundaries`.
3. Manifest `--check`.
4. Full `npm test`, typecheck, lint.
5. Diff review against this plan; commit; open PR into `codex/tll-integration`.
