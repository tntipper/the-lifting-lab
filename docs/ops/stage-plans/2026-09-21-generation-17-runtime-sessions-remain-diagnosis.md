# Generation 17 zero-sessions `runtime_sessions_remain` diagnosis

## Verdict

Generation 17 reached provider staging, database dispatch, and a long `CONNECTION_VERIFICATION` window (~134s), then failed the post-probe zero-sessions proof with:

```json
{"failedPhase":"CONNECTION_VERIFICATION","recoveryOutcome":"RECOVERY_REQUIRED","connectionFailurePresent":false,"failureStep":"zero_sessions","failureReason":"runtime_sessions_remain"}
```

`failureStep: zero_sessions` and `failureReason: runtime_sessions_remain` are **proven**. PR #37’s management-error mapping (preserve allow-listed SQL RAISE text from non-201 bodies) **worked**: Gen 16 live saw collapsed `unavailable`; Gen 17 live saw true `runtime_sessions_remain`, so drain retries armed and still exhausted.

## 1. Confirm drain path ran retries

### Code path

| Step | Module | Behavior |
|------|--------|----------|
| 1 | `staging-generation-17-live-launcher.mjs` `verifyConnections` | After `verifyGeneration6Connections`, calls `verifyGeneration17ZeroSessionsAfterPoolerDrain({ token })`. |
| 2 | `verifyGeneration6Connections` | Per purpose: probe → `finally { client?.release(true); await runtime?.close() }`. Close already runs before zero-sessions. |
| 3 | `verifyGeneration17ZeroSessionsAfterPoolerDrain` (live tip defaults) | `pause(convergenceMs)` then loop `verifyGeneration17ZeroSessions` up to `maxAttempts`. On catch: `classifyZeroSessionsFailure`; retry **only** if reason is `runtime_sessions_remain` and attempts remain. |
| 4 | Live tip defaults (before this PR) | `convergenceMs = POOLER_CONVERGENCE_MS` (**16_000**), `maxAttempts = **3**`. Caps: attempts ≤ 5, wait ≤ 60_000. |
| 5 | `classifyZeroSessionsFailure` + `postManagementQuery` | Allow-listed RAISE text (`runtime sessions remain`) preserved from non-201 JSON → classifier returns `runtime_sessions_remain` → retries arm. |

### Timeline fit (~134s)

Worst-case drain-only pauses on tip: **3 × 16s = 48s** (initial + 2 inter-attempt waits) plus three Management SQL round-trips, on top of five-purpose probe wall (and optional connect-wait / factory-retry path). Gen 16’s ~100s with `unavailable` (no multi-attempt session-remain drain) vs Gen 17’s ~134s is consistent with **retries firing** under true `runtime_sessions_remain`.

## 2. Ranked hypotheses: why sessions remain after max retries

| Rank | Hypothesis | Grade | Notes |
|------|------------|-------|-------|
| 1 | **Supavisor / pooler idle TTL longer than 3 × 16s drain** | **Strong** | Client `runtime.close()` does not instantly clear every `pg_stat_activity` row visible to Management SQL; pooler can keep backends briefly. Live exhausted retries with correct classification. |
| 2 | **Verifier close incomplete for some purpose** | **Weaker** | `finally` always attempts `runtime.close()`; a close failure would surface as probe `connectionFailure` with `check: 'close'`, but live had `connectionFailurePresent: false`. |
| 3 | **Management SQL sees its own / other client backends that still match usename filter** | **Possible** | Zero-session SQL filters `backend_type='client backend'` and the five `tll_*_runtime` usenames. A lingering pooler session under those logins after probe close would correctly RAISE. Unlikely the Management operator session itself (postgres), but another concurrent tool/session with those roles is not fully ruled out. |
| 4 | **usename filter too narrow / too wide** | **Low** | Filter matches the five runtime logins used by probes; narrowing would hide real remainers; widening risks false positives. Do not weaken proof. |
| 5 | **Controls still enabled mis-tagged** | **Ruled out for live** | Would classify as `control_enabled`, not `runtime_sessions_remain`. |
| 6 | **Kill backends via SQL (`pg_terminate_backend`)** | **Rejected here** | Not an approved pattern in this repo for staging zero-session proof. Keep proof read-only; extend drain wait/attempts only. |

## 3. Proven vs inferred vs unknown

### Proven

| Fact | Evidence |
|------|----------|
| Long-session / `run-live-once` held | Operator note; Gen 11/12 interrupt class did not recur |
| Terminal cleanup `RECOVERY_REQUIRED` | Phase journal TERMINAL at `SUPABASE_CLEANUP` |
| Dispatch locked | Journal `RECONCILIATION_REQUIRED`; no replay |
| Evidence fields present | Live summary + on-disk connection-failure.json |
| `failureStep: zero_sessions` | Allow-listed tag |
| `failureReason: runtime_sessions_remain` | Allow-listed tag; **not** Gen 16 `unavailable` |
| PR #37 mapping worked | Classification reached session-remain; drain retries applicable |
| Tip drain defaults were 3 × 16s | `verifyGeneration17ZeroSessionsAfterPoolerDrain` + `POOLER_CONVERGENCE_MS` |
| `runtime.close()` already in verifier finally | `staging-generation-6-connection-verifier.mjs` |
| windowId / expiresAt | `5728d807-701a-486b-a8c5-34bf89238275` / `2026-09-21T09:31:04.000Z` |

### Inferred (strong)

| Inference | Why |
|-----------|-----|
| Multi-attempt session-remain drain ran and exhausted | Correct classification + ~134s vs Gen 16 ~100s |
| Probes passed far enough that no purpose/check evidence attached | `connectionFailurePresent: false` |
| Hosted sessions under runtime usenames still visible after tip drain budget | SQL RAISE text + exhausted retries |

### Unknown

| Unknown | Why |
|---------|-----|
| Exact number of remaining backends / which usename | Live tip did not persist `zeroSessionsAttempts` or session counts (counts would be secret-ish / noisy; attempt count is the allowed diagnostic) |
| Exact idle TTL of the eu-west-2 Supavisor pooler | Provider-side; not observable from tip without extra probes |
| Whether a non-launcher client held a runtime login concurrently | Not ruled out |

## Helper improvements in this PR (Gen 17 tip; Gen 18 clones — package not built)

| Constant | Before | After |
|----------|--------|-------|
| Default drain `convergenceMs` | `POOLER_CONVERGENCE_MS` = **16_000** | `ZERO_SESSIONS_DRAIN_CONVERGENCE_MS` = **30_000** |
| Default `maxAttempts` | **3** | `ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS` = **5** |
| `maxAttempts` hard cap | **5** | `ZERO_SESSIONS_DRAIN_MAX_ATTEMPTS_CAP` = **8** |
| `convergenceMs` hard cap | **60_000** | `ZERO_SESSIONS_DRAIN_CONVERGENCE_MS_CAP` = **90_000** |

Also:

- Persist secret-free **`zeroSessionsAttempts`** (integer 1…cap) on projected zero-sessions failures through launcher → transport → connection-failure evidence / terminal JSON.
- Verify (documented): probe path already calls **`runtime.close()`** in `finally`; no extra close required before drain.
- SQL proof **unchanged**: still requires zero matching runtime sessions **and** all controls off. No `pg_terminate_backend` / arbitrary backend kill.

Worst-case drain pauses after this PR: **5 × 30s = 150s** (still bounded; long-session contract remains mandatory).

## Gen 18 package

**Not** implemented in this PR. No arm. No live. Gen 18 should clone these Gen 17 tip helpers after independent review.

## Replay / successor

- Do not replay Gen 17 journals or re-arm Gen 17.
- Gen 18+ only after diagnosis acceptance, on a disabled successor tip, with independent review before any arm.
