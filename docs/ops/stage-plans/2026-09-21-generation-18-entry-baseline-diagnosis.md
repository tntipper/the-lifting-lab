# Generation 18 entry baseline diagnosis (ENTRY_PREFLIGHT / managementStatusCode 400)

## Verdict

Generation 18 stopped in `ENTRY_PREFLIGHT_RETRY` with:

```json
{"status":"ENTRY_BASELINE_FAILED","failedPhase":"ENTRY_PREFLIGHT_RETRY","recoveryOutcome":"NOT_REQUIRED","connectionFailurePresent":false,"managementStatusCode":400,"nextAction":"REVIEW_ENTRY_BASELINE"}
```

Never reached provider staging or `CONNECTION_VERIFICATION`. `managementStatusCode: 400` is **proven**. Exact SQL RAISE class was **not** proven on the live tip (entry phrases were not allow-listed yet → generic unavailable).

## 1. What ENTRY_PREFLIGHT / entry baseline calls

| Step | Module | Behavior |
|------|--------|----------|
| 1 | `staging-generation-18-run-live-once.mjs` | Long-session env + keepalive → `runNativeGeneration18CredentialWindow` |
| 2 | `staging-generation-18-live-launcher.mjs` | Keychain token → `ports.preflightDatabase: () => verifyGeneration18EntryBaseline({ token })` |
| 3 | `staging-generation-18-transport.mjs` | `notify('ENTRY_PREFLIGHT')` → `preflightDatabase()`; on throw → `ENTRY_PREFLIGHT_RETRY` → retry once; second throw → `ENTRY_BASELINE_FAILED` |
| 4 | `verifyGeneration18EntryBaseline` | Posts `GENERATION_18_ENTRY_BASELINE_SQL` via `postManagementQuery` to `POST https://api.supabase.com/v1/projects/qdmvngjwkcsilzmqksme/database/query` |
| 5 | Entry SQL (read-only DO block) | Operator identity; `tll_staging_private.environment`; five runtime roles inert (`NOLOGIN`, `rolvaliduntil = Gen17 expiresAt`, no password, membership count 5, zero sessions); role comments exact Gen 17 **retired** marker JSON; all controls off; receipt `runtimeGeneration: 17` |

Expected predecessor marker payload (exact):

```json
{"expiresAt":"2026-09-21T09:31:04.000Z","generation":17,"projectRef":"qdmvngjwkcsilzmqksme","state":"retired","windowId":"5728d807-701a-486b-a8c5-34bf89238275"}
```

## 2. Why managementStatusCode 400 fails closed

| Layer | Behavior |
|-------|----------|
| Management API | SQL `RAISE EXCEPTION` / rejected query → HTTP **400** (non-201) with JSON body |
| `postManagementQuery` | Any `statusCode !== 201` → `projectManagementHttpFailure(statusCode, body)` → throw; attaches numeric `managementStatusCode` only |
| Live tip allow-list | Only zero-sessions phrases (`runtime sessions remain`, `control enabled`) were promoted. **Entry** RAISE text (`entry predecessor mismatch`, `entry predecessor marker mismatch`, …) was **not** allow-listed → message collapsed to generic `Generation-18 database transport unavailable` |
| Transport | Surfaces `managementStatusCode` when present; live tip did not set `failureStep`/`failureReason` on entry path |

Compare Gen 17: entry **passed** (project still had Gen 16 retired markers matching Gen 17’s predecessor). Gen 17 later failed at `CONNECTION_VERIFICATION` / `zero_sessions`. Gen 18 never got that far.

## 3. Ranked causes

| Rank | Hypothesis | Grade | Notes |
|------|------------|-------|-------|
| 1 | **Gen 17 recovery left non-retired / wrong-generation project state** | **Strong** | Gen 17 live ended `RECOVERY_REQUIRED` (not `RECOVERY_VERIFIED`). Tip `scripts/staging-generation-17-recovery.mjs` pins `successor = { generation: 16, windowId: 313afec9-… }` (clone of Gen 16). After Gen 17 **dispatch**, markers are Gen 17 **active** (`5728d807-…`). Recovery SQL that expects Gen **16** markers fails closed → roles likely remain Gen 17 active (LOGIN / memberships / sessions / `state:'active'`). Gen 18 entry requires Gen 17 **retired** exact marker → Management 400. Gen 17 recovery **test** asserts the Gen-16 pins, locking the bug in. |
| 2 | **Stale predecessor window / marker mismatch** | **Strong (subset of #1)** | Entry compares parsed role comments to exact Gen 17 retired JSON. Active Gen 17, Gen 16 retired, or mixed markers all RAISE `entry predecessor marker mismatch` / `predecessor mismatch`. |
| 3 | **Remaining runtime sessions after Gen 17** | **Possible** | Gen 17 failed `runtime_sessions_remain`; recovery likely never completed NOLOGIN/session drain. Entry’s predecessor block also requires zero runtime sessions. |
| 4 | **Wrong SQL / admit action** | **Low for Gen 18 tip** | Entry SQL is `BEGIN READ ONLY` via Management query endpoint; same path Gen 17 used successfully for entry. No Gen 18 dispatch/admit yet. |
| 5 | **Gen 18 window id conflict** | **Low at entry** | Entry receipt stamps Gen 18 `windowId` only after PASS; failure is pre-receipt. Conflict would matter after dispatch, not here. |
| 6 | **Staging account / operator activation** | **Weaker** | Would RAISE `entry operator mismatch` / `entry environment mismatch`. Token auth worked enough to get HTTP 400 with SQL body semantics (not 401). Not ruled out without classified reason. |
| 7 | **Controls still enabled** | **Possible** | Would RAISE `entry control enabled`. Gen 17 recovery should disable controls but may not have run. |

## 4. Proven vs inferred vs unknown

### Proven

| Fact | Evidence |
|------|----------|
| Long-session / `run-live-once` held ~2s | Operator note; exit was entry failure, not interrupt |
| Terminal `ENTRY_BASELINE_FAILED` | Live stdout JSON |
| `failedPhase: ENTRY_PREFLIGHT_RETRY` | Retry path ran (first preflight threw, second threw) |
| `managementStatusCode: 400` | Live stdout |
| `recoveryOutcome: NOT_REQUIRED` | No dispatch → no recovery |
| Stopped before Vercel/Supabase/CONNECTION_VERIFICATION | Phase journal |
| Gen 17 recovery generator pins Gen **16** successor | `scripts/staging-generation-17-recovery.mjs` + recovery test asserts `'16'` / `313afec9-…` |
| Gen 18 recovery generator pins Gen **18** correctly | `scripts/staging-generation-18-recovery.mjs` + recovery test |

### Inferred (strong)

| Inference | Why |
|-----------|-----|
| Management SQL RAISE (not network/auth) | HTTP 400 on database/query after authenticated token path |
| Project state ≠ Gen 17 retired inert baseline | Entry SQL is the only work before fail; Gen 17 left `RECOVERY_REQUIRED` |
| Exact RAISE class collapsed | Tip entry allow-list gap |

### Unknown (live tip)

| Unknown | Why |
|---------|-----|
| Exact allow-listed `failureReason` | Not persisted on live tip |
| Whether markers are active Gen 17 vs Gen 16 retired vs mixed | Requires classified entry reason or read-only operator inspect (not done here) |
| Session count / which usenames | Not observed |

## 5. Concrete Gen 19 fix candidates (do not implement Gen 19 package here)

1. **Fix Gen N recovery generator contract** — `staging-generation-N-recovery.mjs` `successor` must be **this** generation’s `GENERATION` + `WINDOW_ID` (Gen 17 tip wrongly pins Gen 16). Add a test: recovery SQL generation/window === credentials package. Regenerate Gen 17 recovery artefacts only under explicit cleanup review — do not replay Gen 17 live.
2. **Operator-approved read-only inspect + one-shot Gen-17-correct recovery** — Before Gen 19 entry, confirm role markers/sessions/controls; if Gen 17 active remains, run a **corrected** Gen 17 recovery (pins `generation:17` / `5728d807-…`) under separate approval, or an explicit cleanup transaction reviewed independently. Do not weaken Gen 19 entry SQL.
3. **Keep entry allow-list + `failureStep: preflight`** — Already added on this Gen 18 tip (gates off): promote entry RAISE phrases; persist `failureStep`/`failureReason`/`managementStatusCode`; persist on-disk evidence for `ENTRY_BASELINE_FAILED`. Gen 19 clones these helpers.
4. **Gen 19 entry predecessor** — Must match **actual** post-cleanup retired state (likely Gen 17 retired with dispatch-journal `expiresAt`, or a new documented cleanup marker). Remint Gen 19 `WINDOW_ID` / package; do not remint Gen 18.
5. **Do not** open Gen 18 replay; do not arm Gen 18 again; do not weaken entry proofs or zero-sessions drain defaults.

## Helper improvements in this PR (Gen 18 tip; gates remain false)

| Change | Purpose |
|--------|---------|
| Allow-listed entry RAISE phrases in `extractAllowListedSqlExceptionMessage` | Classify entry failures like zero-sessions |
| `classifyEntryBaselineFailure` + `projectEntryBaselineFailure` | Secret-free `failureStep: preflight` + reason + `managementStatusCode` |
| Transport allow-list for entry reasons | Forward into launcher stdout |
| `persistConnectionFailureEvidence` for `ENTRY_BASELINE_FAILED` | On-disk secret-free statusCode + step |

## Gen 19 package

**Not** implemented in this PR. No arm. No live.

## Replay / successor

- Do not replay Gen 18 journals or re-arm Gen 18.
- Gen 19+ only after diagnosis acceptance, on a disabled successor tip, with independent review before any arm.
- Gen 17–18 remain non-replayable.
