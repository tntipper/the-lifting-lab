# Generation 13 disabled successor and live-launcher design

## Outcome

Prepare a fresh, fully disabled Generation 13 credential package derived from the Generation 12 pattern, plus a dedicated live launcher and the **only** supported Phase 3 operator entry. Bake in Generation 11 + Generation 12 interrupted-live ops lessons as **runtime guards**, not comments alone. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 13 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 12 with Gen 11/12 runtime lessons applied from the start.
- Ordinary Gen 13 transport modules are injected-only: no `runNativeGeneration13CredentialWindow`, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Journal-before-material ordering and `JOURNAL_CLAIM_REJECTED` are present in Gen 13 transport.
- `scripts/staging-generation-13-live-launcher.mjs` is the only module that may define/invoke Gen 13 native live work; it uses `scripts/staging-window-phase-journal.mjs`.
- When native gates are armed, the live launcher **refuses** start unless `TLL_LIVE_LONG_SESSION=1` and a parent-held keepalive path (`TLL_LIVE_KEEPALIVE_PATH`) satisfy `assertLongSessionContract` (orphan/nohup detection included). When gates are disabled, it returns `NATIVE_TRANSPORT_DISABLED` without requiring the long-session env (ordinary tests must pass).
- `scripts/staging-generation-13-run-live-once.mjs` is the only supported Phase 3 operator entry: sets the long-session env, holds keepalive, runs the launcher in the foreground, optionally follows journal-watch, writes a secret-free session summary under `implementation-state/staging/`.
- `scripts/staging-generation-13-journal-watch.mjs` supports `--follow --interval N` until `TERMINAL` or `STALE_REQUIRES_RECONCILIATION`; default one-shot behaviour is preserved.
- `npm run check:live-boundaries` passes with Gen 13 coverage; ordinary tests cannot import or call the Gen 13 live launcher.
- Manifest pins Gen 13 artefacts with `nativeTransportEnabled: false`, `generation13Armed: false`, and keeps Gen 10/11/12 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–12 journal rewrite.

## Gen 11 + Gen 12 interrupted-live lessons (cite + enforce)

Sources:

- `docs/ops/stage-plans/2026-09-20-generation-11-interrupted-live-attempt.md`
- `docs/ops/stage-plans/2026-09-20-generation-12-interrupted-live-attempt.md`
- `docs/ops/stage-plans/2026-09-20-generation-12-interrupted-learning-review.md` (actions 1–5)

| # | Learning action | Gen 13 enforcement |
|---|-----------------|--------------------|
| 1 | Hard start contract in the launcher CLI | `assertLongSessionContract` before journal claim when gates armed |
| 2 | Supported operator entry wrapper | `scripts/staging-generation-13-run-live-once.mjs` |
| 3 | Continuous journal observer | journal-watch `--follow --interval N` |
| 4 | Phase 3 start checklist in stage plan | this document (below) |
| 5 | No overnight unattended live without proven supervisor | checklist fail line; default refuse |

Additional process lessons: comments-only prevention is a QC fail; never claim Phase 3 “started correctly” until journal shows progress **and** `ps` shows launcher alive after 60s.

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-13-credentials/v1` |
| Window ID | `866b0e78-7530-493a-8963-e8cf24cf3067` |
| Role predecessor | Gen 10 / `04e1b5da-b3e1-430b-8247-caf1d46faa5a` / expires `2026-09-20T21:08:17.000Z` (Gen 11/12 never reached DATABASE_DISPATCH; roles remain Gen 10 retired) |
| Superseded attempts | Gen 11 / `56ff2757-3e34-4cf0-a1dc-40999a713874` and Gen 12 / `6d4c5ed4-08a3-4d20-b580-cd03ab000e83` — both `INTERRUPTED_RECOVERED_INTENT_LOCKED_NO_REPLAY` / replay forbidden |
| Credentials | `scripts/staging-generation-13-credentials.mjs` |
| Transport | `scripts/staging-generation-13-transport.mjs` |
| DB transport | `scripts/staging-generation-13-database-transport.mjs` |
| Keychain | `scripts/staging-generation-13-keychain.py` |
| Recovery | `scripts/staging-generation-13-recovery.mjs` + SQL under `config/` |
| Live launcher | `scripts/staging-generation-13-live-launcher.mjs` |
| Run-live-once | `scripts/staging-generation-13-run-live-once.mjs` |
| Journal watch | `scripts/staging-generation-13-journal-watch.mjs` (`--follow` supported) |
| Tests | `tests/staging-generation-13-*.test.mjs` (+ boundary/manifest extensions) |
| Manifest key | `generation13Successor` |
| Staging project | `qdmvngjwkcsilzmqksme` only |
| Production excluded forever | `wrhgscovsgsudtedbljr` |

Assumption requiring evidence before any future arming: recovered runtime roles retain retired Gen 10 markers and `VALID UNTIL` equal to the Gen 10 journal expiry above (Gen 11/12 interrupts left provider state clean without installing Gen 11/12 credentials). If a later read-only baseline disagrees, stop and revise before any arming diff.

## Phase 3 start checklist (pass/fail — complete before any future arming merge is requested)

| Check | Pass | Fail |
|-------|------|------|
| Long-session Shell `block_until` ~45–55m foreground **or** `node scripts/staging-generation-13-run-live-once.mjs` | ☐ | ☐ |
| Separate observer: journal-watch `--follow --interval 20` (or wrapper `--watch-interval 20`) | ☐ | ☐ |
| Never kill while `ACTIVE_WITHIN_PHASE_BOUND` | ☐ | ☐ |
| No `npm test` / ordinary test suite while armed | ☐ | ☐ |
| No overnight unattended live without a proven supervisor (launchd/tmux drill done) | ☐ | ☐ |
| `TLL_LIVE_LONG_SESSION=1` + keepalive held for whole run | ☐ | ☐ |
| Not started via nohup / detached short remote shell | ☐ | ☐ |
| Gen 11 and Gen 12 journals remain non-replayable | ☐ | ☐ |

## Explicit stop before arming

This stage ends when the disabled package, live launcher, run-live-once wrapper, journal-watch follow mode, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff** (a separate change that flips native/Keychain gates). This PR must not contain that diff.

A later approved live attempt must:

1. Start **only** via `scripts/staging-generation-13-run-live-once.mjs` in a long-lived foreground process that covers the full phase budgets (~45–55 minutes wall), **or** an equivalent Shell with `block_until` covering those budgets while holding the keepalive contract.
2. Monitor only via the phase journal from a separate read-only process (`journal-watch --follow` / `assessStagingWindowProgress`).
3. Never kill while status is `ACTIVE_WITHIN_PHASE_BOUND`.
4. Stop after one attempt; reconcile; disarm; never run `npm test` while armed.
5. Never replay Generation 11 or Generation 12.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–12 journals or recovery evidence.
- No production Supabase `wrhgscovsgsudtedbljr`; staging only `qdmvngjwkcsilzmqksme`.
- No purchases, emails or supplier orders.
- No merge to `main`.

## Verification order

1. Focused Gen 13, long-session contract, boundary and phase-journal tests.
2. `npm run check:live-boundaries`.
3. Manifest regenerate / pin check.
4. Disabled launcher CLI returns `NATIVE_TRANSPORT_DISABLED` without long-session env.
5. Full `npm test`, typecheck, lint (note known env gap if `native_adapter.py` is missing — do not invent the file).
6. Diff review against this plan; commit; open PR into `codex/tll-integration`.
