# Generation 15 recovery diagnosis (missing connectionFailure)

## Verdict

Generation 15 reached provider staging, database dispatch, and a long `CONNECTION_VERIFICATION` window (~80s), then terminated `RECOVERY_REQUIRED` / `RECONCILIATION_REQUIRED` **without** secret-free `connectionFailure` evidence. That is a different evidence shape from Gen 14, where the same terminal status carried `{purpose:bridge,check:own_probe}`.

Strongest reading of the code + live timeline:

1. The Gen 15 bridge `own_probe` fix (`register` + `{}` + expected `error`) **likely worked** (inferred from ~80s verification and absence of bridge/own_probe evidence).
2. Something after the probe path — most likely `verifyGeneration15ZeroSessions` nested inside the launcher’s `verifyConnections` port, or database recovery itself — produced `RECOVERY_REQUIRED` **without** attaching `connectionFailure`.
3. Evidence helpers only persisted a file when `connectionFailure` projected successfully, so the live Mac left **no** `tll-generation-15-connection-failure.json`.

## Proven vs inferred vs unknown

### Proven

| Fact | Evidence |
|------|----------|
| Long-session / `run-live-once` held | Live note; Gen 11/12 interrupt class did not recur |
| Terminal cleanup outcome `RECOVERY_REQUIRED` | Phase journal TERMINAL at `SUPABASE_CLEANUP` |
| Dispatch locked | Journal `RECONCILIATION_REQUIRED`; no replay |
| No `connectionFailure` on live-session summary | Operator observation of summary JSON |
| No on-disk Gen 15 connection-failure evidence file | Operator observation |
| Bridge probe on tip is `register`+`{}`+`error` | Shared verifier + Gen 15 Phase 1 / PR #32 lineage |
| Launcher nests zero-session proof inside `verifyConnections` after `verifyGeneration6Connections` | `scripts/staging-generation-15-live-launcher.mjs` |
| Transport only projects `connectionFailure` when throw-site phase is `CONNECTION_VERIFICATION` **and** `error.connectionFailure` allow-list-projects | `scripts/staging-generation-15-transport.mjs` |
| Pre-fix evidence helper returned `null` (no file) when `connectionFailure` absent | `persistConnectionFailureEvidence` prior behavior |
| Cleanup notifies overwrite `phase` before the returned object is frozen | Transport catch: recovery/cleanup `notify(...)` then return `{phase,...}` |

### Inferred (strong)

| Inference | Why |
|-----------|-----|
| Connection probes progressed further than Gen 14 | ~80s in `CONNECTION_VERIFICATION` vs Gen 14’s fast bridge/`own_probe` fail; no bridge/own_probe artifact this time |
| Bridge `own_probe` fix likely held | Absence of Gen 14’s exact evidence; tip already uses `register`/`error` |
| Failure was not a tagged probe failure, or probe evidence was dropped | Live run had RECOVERY_REQUIRED with no connectionFailure field/file |
| Zero-session proof after probes is the leading non-probe throw site inside CONNECTION_VERIFICATION | Same port; no `connectionFailure` attachment on that path (pre-fix) |
| DATABASE_RECOVERY then failed closed | Terminal status `RECOVERY_REQUIRED` means `recoverDatabase()` threw after dispatch |

### Unknown (evidence still insufficient)

| Unknown | Why |
|---------|-----|
| Exact throw site on the live Mac (zero-sessions vs recovery SQL vs postcommit vs other) | No failedPhase / failureStep persisted on that run |
| Whether every purpose’s connect/identity/membership/matrix/own_probe/table_denial passed | No purposesPassed / purpose-check evidence this time |
| Hosted recovery SQL vs postcommit which sub-step failed | Outcome is only RECOVERY_REQUIRED |
| Whether provider readback had a latent issue masked by later recovery | Phases advanced past PROVIDER_READBACK before CONNECTION_VERIFICATION |

## Ranked hypotheses

1. **Evidence gap on non-probe RECOVERY_REQUIRED paths (code-proven; strongest for missing file/field)** — `persistConnectionFailureEvidence` / launcher terminal only kept probe evidence; zero-sessions or recovery failures produced RECOVERY_REQUIRED with no allow-listed `connectionFailure`, so nothing was written. **Fixed in this disarm PR** for Gen 15 helpers (Gen 16 inherits; Gen 16 package not built).
2. **Zero-session proof failed after probes passed (inferred; strongest for “no bridge/own_probe”)** — launcher calls `verifyGeneration15ZeroSessions` after successful `verifyGeneration6Connections` inside the same CONNECTION_VERIFICATION port without attaching probe evidence.
3. **Probe failure whose report failed allow-list projection (possible but weaker)** — e.g. `purpose:null` WeakMap miss would drop projection; would still usually leave *some* tagged failure if the verifier threw its normal unavailable error. Less consistent with ~80s duration + total absence of bridge/own_probe.

## Did CONNECTION_VERIFICATION fail, or a later step?

- **Proven:** the run entered CONNECTION_VERIFICATION and later DATABASE_RECOVERY / cleanups, ending RECOVERY_REQUIRED.
- **Inferred:** either CONNECTION_VERIFICATION threw without probe evidence (zero-sessions / untagged error) **or** a tagged probe failure was dropped by projection; then recovery failed.
- **Not proven:** that CONNECTION_VERIFICATION fully passed and a post-verification phase threw — transport only enters recovery from the catch path after dispatch, and JOURNAL_FINALIZE is the only later happy-path step before success.

## Bridge own_probe fix — did it work?

| Rank | Claim | Grade |
|------|-------|-------|
| 1 | Bridge `register`/`error` probe no longer the hard fail Gen 14 hit | **Inferred (strong)** — longer CONNECTION_VERIFICATION; no bridge/own_probe evidence |
| 2 | Early purposes still connect with projected SCRAM + pinned CA | **Inferred** — reaching a long CONNECTION_VERIFICATION implies dispatch + verifier start |
| 3 | Bridge own_probe still failed but evidence was lost | **Inferred (weak)** — would require projection drop of a valid bridge/own_probe report |

## Secret-free fields Gen 16 must persist on ANY path to RECOVERY_REQUIRED

Already wired into Gen 15 helpers in this PR (no Gen 16 package / no arm / no live):

- `failedPhase` — throw-site phase before recovery/cleanup notifies overwrite `phase`
- `connectionFailurePresent` — boolean even when probe evidence is absent
- `recoveryOutcome` — `NOT_REQUIRED` \| `RECOVERY_VERIFIED` \| `RECOVERY_REQUIRED`
- `failureStep` when known (allow-listed; e.g. `zero_sessions`)
- `connectionFailure` when present (allow-listed purpose/check/status/reason + optional sqlstate/expectedMode/purposesPassed/host/port)

## Evidence bug fixed in this PR?

**Yes (helpers only).** Gen 15 transport now retains `failedPhase` / `recoveryOutcome` / `connectionFailurePresent`; evidence helpers persist RECOVERY_* records without requiring `connectionFailure`; live launcher tags zero-session failures with `failureStep:'zero_sessions'`; run-live-once summary surfaces the new fields.

## Replay / successor

- Do not replay Gen 15 journals or re-arm Gen 15.
- Gen 16+ only after diagnosis acceptance, on a disabled successor tip, with independent review before any arm.
- Do not implement Gen 16 in this PR.
