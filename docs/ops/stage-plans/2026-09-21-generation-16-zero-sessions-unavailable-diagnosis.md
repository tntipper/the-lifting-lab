# Generation 16 zero-sessions `unavailable` diagnosis

## Verdict

Generation 16 reached provider staging, database dispatch, and a long `CONNECTION_VERIFICATION` window (~100s), then failed the post-probe zero-sessions proof with:

```json
{"failedPhase":"CONNECTION_VERIFICATION","recoveryOutcome":"RECOVERY_REQUIRED","connectionFailurePresent":false,"failureStep":"zero_sessions","failureReason":"unavailable"}
```

`failureStep: zero_sessions` is **proven**. `failureReason: unavailable` means the allow-listed classifiers for `runtime_sessions_remain` / `control_enabled` / `receipt_mismatch` did **not** match the thrown error message (or its cause chain) at the live tip.

Strongest reading of the code + live timeline:

1. Probe path progressed far enough that no `connectionFailure` purpose/check was attached (matches Gen 15 gap-close; Gen 16 evidence fields present).
2. Launcher then called `verifyGeneration16ZeroSessionsAfterPoolerDrain` inside the same `CONNECTION_VERIFICATION` port.
3. The zero-sessions SQL `RAISE EXCEPTION` path, if hit, returns a **non-201** Management API response. On the live tip, `postManagementQuery` **destroyed that response without reading the body** and threw generic `Generation-16 database transport unavailable`.
4. `classifyZeroSessionsFailure` therefore always saw `unavailable` for real session-remain / control-enabled RAISES — so **bounded drain retries never armed**, even if sessions were still draining.
5. ~100s CONNECTION_VERIFICATION is consistent with Gen-15-like probe wall + one `POOLER_CONVERGENCE_MS` drain + a single failed management query — **not** multi-attempt `runtime_sessions_remain` retries.

## Trace: how `failureReason: 'unavailable'` is assigned

| Step | Module | Behavior |
|------|--------|----------|
| 1 | `staging-generation-16-live-launcher.mjs` `verifyConnections` | After `verifyGeneration6Connections`, calls `verifyGeneration16ZeroSessionsAfterPoolerDrain({ token })`. |
| 2 | `verifyGeneration16ZeroSessionsAfterPoolerDrain` | Waits `POOLER_CONVERGENCE_MS`, then loops `verifyGeneration16ZeroSessions`. On catch: `classifyZeroSessionsFailure(error)`; retries **only** if reason is `runtime_sessions_remain` and attempts remain; else `projectZeroSessionsFailure(error, failureReason)`. |
| 3 | `verifyGeneration16ZeroSessions` | Posts fixed zero-session SQL via `postManagementQuery`. On success requires exact `tll_generation_16_zero_sessions` receipt (`receipt_mismatch` otherwise). SQL RAISES: `Generation 16 runtime sessions remain` / `Generation 16 control enabled during zero-session proof`. |
| 4 | `postManagementQuery` (live tip before this PR) | Required `statusCode === 201` + JSON array. Any other status **destroyed the body** and rejected with `Generation-16 database transport unavailable`. |
| 5 | `classifyZeroSessionsFailure` | Regexes on `error.message`: `runtime sessions remain` → `runtime_sessions_remain`; `control enabled` → `control_enabled`; `zero-session receipt mismatch` → `receipt_mismatch`; else → **`unavailable`**. |
| 6 | Launcher catch | Re-projects `failureStep: 'zero_sessions'` and `failureReason` from allow-list (defaults to `unavailable` if missing). |
| 7 | Transport + evidence | Persists `failedPhase`, `recoveryOutcome`, `connectionFailurePresent`, `failureStep`, `failureReason` on RECOVERY_* paths. |

## Ranked hypotheses: why live hit `unavailable` vs `runtime_sessions_remain`

| Rank | Hypothesis | Grade | Notes |
|------|------------|-------|-------|
| 1 | **Management API non-201 body discarded → generic unavailable** (classification bug) | **Proven in code**; **inferred** for live | SQL RAISE never reaches classifier as `runtime sessions remain` / `control enabled` because tip transport replaced the body with generic unavailable. Explains `unavailable` **and** lack of drain retries. Fixed in this PR for Gen 16 helpers. |
| 2 | True transport/API/token failure (timeout, auth, non-JSON, empty body) | **Possible** | Would correctly classify `unavailable`. Less consistent with successful earlier management calls (entry baseline + credential dispatch) in the same window, but token/session expiry mid-window is not fully ruled out. |
| 3 | Receipt key / shape mismatch (`tll_generation_16_zero_sessions`) | **Weaker** | Would surface as `receipt_mismatch`, not `unavailable`, unless the mismatch path threw transport unavailable instead (e.g. non-array 201 body → unavailable). |
| 4 | Control still enabled | **Mis-tagged if #1** | SQL text exists; tip classifier would only see it if management error body was preserved. |
| 5 | Runtime sessions still present after one drain | **Mis-tagged if #1**; **unknown** as ground truth | Drain retries only arm on `runtime_sessions_remain`. With `unavailable`, retries do not run — so live cannot prove sessions remained vs API-shape collapse. |

## Proven vs inferred vs unknown

### Proven

| Fact | Evidence |
|------|----------|
| Long-session / `run-live-once` held | Operator note; Gen 11/12 interrupt class did not recur |
| Terminal cleanup `RECOVERY_REQUIRED` | Phase journal TERMINAL at `SUPABASE_CLEANUP` |
| Dispatch locked | Journal `RECONCILIATION_REQUIRED`; no replay |
| Evidence fields present | Live summary + on-disk connection-failure.json with `failedPhase` / `failureStep` / `failureReason` |
| `failureStep: zero_sessions` | Allow-listed tag from launcher / drain projector |
| `failureReason: unavailable` | Allow-listed tag; not session-remain / control / receipt |
| Tip `postManagementQuery` discarded non-201 bodies | `scripts/staging-generation-16-database-transport.mjs` pre-fix |
| Drain retries require classified `runtime_sessions_remain` | `verifyGeneration16ZeroSessionsAfterPoolerDrain` |
| windowId / expiresAt | `313afec9-46d0-41bb-af47-0be277c6fa4f` / `2026-09-21T08:42:01.000Z` |

### Inferred (strong)

| Inference | Why |
|-----------|-----|
| Probes passed far enough that no purpose/check evidence attached | `connectionFailurePresent: false` + long CONNECTION_VERIFICATION |
| Live `unavailable` is explained by management-error body collapse on SQL RAISE **or** a true transport failure after dispatch | Code path #1 proven; live body text not retained |
| Multi-attempt session-remain drain did **not** run | `failureReason !== runtime_sessions_remain`; ~100s fits one drain + one fail |

### Unknown

| Unknown | Why |
|---------|-----|
| Whether hosted DB still had runtime sessions at proof time | Classifier never received RAISE text on tip |
| Whether controls were enabled | Same |
| Exact Management API status / JSON keys on the live Mac | Body was destroyed; not persisted secret-free |
| Whether token/CA/network failed uniquely on the zero-sessions call | No managementStatusCode persisted on tip |

## Classification bug fixed in this PR?

**Yes (Gen 16 helpers only; Gen 17 inherits; Gen 17 package not built).**

- `postManagementQuery` now drains non-201 JSON bodies and, when the body contains allow-listed phrases (`runtime sessions remain` / `control enabled`), rejects with a **normalized secret-free** message so `classifyZeroSessionsFailure` can map them and arm drain retries.
- `classifyZeroSessionsFailure` walks `error.cause` (depth-bounded).
- SQL proof text and ZERO_SESSIONS receipt requirements are **unchanged** (not weakened).
- Gates remain disarmed; no arm; no live.

## Gen 17 fix candidates (do **not** implement Gen 17 package here)

1. **Richer allow-listed mapping** of Management SQL/HTTP errors → `runtime_sessions_remain` / `control_enabled` / `receipt_mismatch` / `unavailable` (keep deny-by-default).
2. **Persist secret-free diagnostics** on zero-sessions failures: `managementStatusCode`, sorted response object keys (not values), exception class / allow-listed phrase id — never SQL, tokens, or raw bodies.
3. **Timing/order** — if classified session-remain still exhausts retries after the body-preservation fix: reconsider convergence wait vs probe-close ordering; still do not weaken the SQL proof.
4. **Phase naming** — optionally journal zero-sessions under a distinct phase (e.g. `ZERO_SESSIONS_PROOF`) so operator journals separate probe wall from drain/proof without changing the SQL contract.
5. **Independent arming review** only after this diagnosis is accepted; Gen 16 remains non-replayable.

## Replay / successor

- Do not replay Gen 16 journals or re-arm Gen 16.
- Gen 17+ only after diagnosis acceptance, on a disabled successor tip, with independent review before any arm.
- Do not implement Gen 17 in this PR.
