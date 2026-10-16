# Generation 14 disabled successor (Phase 1)

## Outcome

Prepare a fresh, fully disabled Generation 14 credential package derived from the Generation 13 Phase 1 shape, baking in Gen 11/12 short-shell, Gen 9 pinned-CA, and Gen 13 SCRAM + secret-free `connectionFailure` evidence learnings as **runtime behaviour**, not comments alone. Leave every native gate disarmed. Do not arm, do not run a live attempt, and do not touch production.

## Acceptance criteria

- Generation 14 package ids, window id, transport modules, database transport, keychain helper, recovery artefacts, credentials dispatch journal schema and tests exist and mirror Generation 13 with mandatory bake-ins applied from day one.
- Ordinary Gen 14 transport modules are injected-only: no `runNativeGeneration14CredentialWindow`, no credential-bearing imports, `NATIVE_*_ENABLED = false`, keychain `APPROVED_NATIVE_READ = False`.
- Journal-before-material ordering and `JOURNAL_CLAIM_REJECTED` are present in Gen 14 transport.
- SCRAM verifiers are derived from **projected base64url** passwords (`deriveScramVerifier(projection.passwords[purpose], …)`), never raw `material.passwords` Buffers — focused transport test proves projected SCRAM is embedded and raw-equivalent is not.
- Secret-free connectionFailure evidence helpers persist `{purpose,check,status,reason}` into launcher stdout, implementation-state evidence file, and live-session summary.
- Pinned CA via `readPinnedSupabaseCa()` is wired into the live launcher connection verifier.
- `scripts/staging-generation-14-live-launcher.mjs` is the only module that may define/invoke Gen 14 native live work; it uses `scripts/staging-window-phase-journal.mjs`.
- When native gates are armed, the live launcher **refuses** start unless `TLL_LIVE_LONG_SESSION=1` and a parent-held keepalive path (`TLL_LIVE_KEEPALIVE_PATH`) satisfy `assertLongSessionContract` (orphan/nohup detection included). When gates are disabled, it returns `NATIVE_TRANSPORT_DISABLED` without requiring the long-session env (ordinary tests must pass).
- `scripts/staging-generation-14-run-live-once.mjs` is the only supported Phase 3 operator entry.
- `scripts/staging-generation-14-journal-watch.mjs` supports `--follow --interval N`.
- `npm run check:live-boundaries` passes with Gen 14 coverage.
- Manifest pins Gen 14 artefacts with `nativeTransportEnabled: false`, `generation14Armed: false`, and keeps Gen 11/12/13 non-replayable.
- No arming diff, no live process, no hosted mutation, no Gen 6–13 journal rewrite.

## Lessons baked in from day one

| Source | Lesson | Gen 14 enforcement |
|--------|--------|--------------------|
| Gen 11/12 interrupted live | Short-lived/`nohup` kill mid-`VERCEL_STAGE` | Long-session contract + `run-live-once` only + journal-watch `--follow` |
| Gen 9 | Omitted public Supabase CA | `readPinnedSupabaseCa()` → `tlsCa` into verifier |
| Gen 13 diagnosis (PR #28) | SCRAM from raw Buffer ≠ projected base64url | `deriveScramVerifier(projection.passwords[purpose], …)` + focused test |
| Gen 13 diagnosis (PR #28) | `connectionFailure` stripped from stdout/summary | Evidence helpers + launcher/`run-live-once` wiring |

## Planned artefacts

| Artefact | Path / value |
|----------|----------------|
| Package ID | `tll-staging-generation-14-credentials/v1` |
| Window ID | `a8955fc3-2347-4544-b04e-55a2cb6fe7aa` |
| Role predecessor | Gen 13 / `866b0e78-7530-493a-8963-e8cf24cf3067` (Gen 13 reached `DATABASE_DISPATCH` and recovery wrote Gen 13 retired markers; Gen 11/12 never dispatched) |
| Predecessor expiresAt | `2026-09-21T06:36:08.000Z` — confirmed 2026-09-21 from local Gen 13 dispatch journal `implementation-state/staging/tll-generation-13-credential-dispatch.json` (`liveReadOnlyConfirmed: true`) |
| Superseded / locked | Gen 11 + Gen 12 `INTENT_RECORDED` no-replay; Gen 13 `RECONCILIATION_REQUIRED` / `CONNECTION_RECOVERY_VERIFIED_…_NO_REPLAY` |
| Staging project | `qdmvngjwkcsilzmqksme` only |
| Production excluded forever | `wrhgscovsgsudtedbljr` |
| Manifest key | `generation14Successor` |
| Status | `DISABLED_SUCCESSOR_AWAITING_ARMING_REVIEW` |

## Phase 3 start checklist (pass/fail — complete before any future arming merge is requested)

| Check | Pass | Fail |
|-------|------|------|
| Predecessor Gen 13 `expiresAt` confirmed from dispatch journal (`2026-09-21T06:36:08.000Z`); `liveReadOnlyConfirmed: true` | ☑ | ☐ |
| Long-session Shell / `node scripts/staging-generation-14-run-live-once.mjs` only | ☐ | ☐ |
| Separate observer: journal-watch `--follow --interval 20` | ☐ | ☐ |
| Never kill while `ACTIVE_WITHIN_PHASE_BOUND` | ☐ | ☐ |
| No `npm test` / ordinary suite while armed | ☐ | ☐ |
| No overnight unattended live without proven supervisor | ☐ | ☐ |
| `TLL_LIVE_LONG_SESSION=1` + keepalive held for whole run | ☐ | ☐ |
| Not started via nohup / detached short remote shell | ☐ | ☐ |
| Gen 11/12/13 journals remain non-replayable | ☐ | ☐ |
| SCRAM projected-password derivation still present on tip | ☐ | ☐ |
| ConnectionFailure evidence helpers still wired | ☐ | ☐ |
| Pinned CA still wired into launcher verifier | ☐ | ☐ |

## Explicit stop before arming

This stage ends when the disabled package, live launcher, run-live-once wrapper, journal-watch follow mode, evidence helpers, SCRAM projected derivation, boundary coverage, tests and documentation are committed. The next gate is **independent review of the exact arming diff** (a separate change that flips native/Keychain gates). This PR must not contain that diff.

Gen 13 predecessor `expiresAt` is confirmed from the live Mac dispatch journal. Gates remain disabled; arming is still a separate reviewed change.

## Exclusions

- No gate enablement, Keychain access, native credential dispatch or hosted mutation.
- No rewrite of consumed Gen 6–13 journals or recovery evidence.
- No production Supabase `wrhgscovsgsudtedbljr`; staging only `qdmvngjwkcsilzmqksme`.
- No purchases, emails or supplier orders.
- No merge to `main`.
- No Gen 11/12/13 replay.

## Verification order

1. Focused Gen 14 credentials/transport/DB/recovery/long-session/evidence + SCRAM + boundary + manifest tests.
2. `npm run check:live-boundaries`.
3. Manifest regenerate / pin check.
4. Disabled launcher CLI returns `NATIVE_TRANSPORT_DISABLED` without long-session env.
5. Full `npm test`, typecheck, lint (note known cloud env gaps such as missing `typescript` / `esbuild` / `native_adapter.py` — do not invent those files).
6. Diff review against this plan; commit; open PR into `codex/tll-integration`.
