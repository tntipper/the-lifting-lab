# V8 diagnostic: failure map and stop gates

## Decision now

**HOLD. Do not create credentials, arm or run v8.** The owner's cross-attempt
review found a reproducible cleanup-settlement defect. Correct and review it
offline first. A future one-shot run may legitimately return HOLD: the
pre-existing enabled/JWKS provider and absent application-manifest proof
already prevent a clean PASS. V8's purpose is a trustworthy, classified
observation, not activation.

## What failed and what changed

| Attempt | Observed failure | Proven cause or limit | Changed control | Remaining risk |
| --- | --- | --- | --- | --- |
| v4 | Generic failed database observation | Management API read-only role differed from SQL's assumed `postgres` | SQL v2 and role regression | Real role/envelope drift |
| v5 | Intent-only `RECONCILIATION_REQUIRED` | Initiating read unknown; native errored-stream cancellation wrongly appeared unresolved | Terminal-stream evidence and safe diagnostic code | Late cleanup may outlive tracker settlement |
| v6 | `vercel_environment_read_unavailable` | Real short Preview page omitted `pagination`; parser required it | Short-page omission accepted, full-page omission held, exact-endpoint preflight | API envelope drift |
| v7 | Generic `observation_validation_unavailable` | Direct live trigger unknown; serial reads later succeeded | Finite stage labels, malformed-envelope tests, three completion-order replays | Transient or unrecorded live shape |

Earlier credential setup stored an empty token, reversed Keychain labels,
and timed out on a bypass item with no allowed reader. Those were pre-run
failures, not hosted-observer failures. The control is private value
comparison before closing the one-time token view, exact three-selector
readback, and only `/usr/bin/security` temporarily allowed on the bypass.

## Risks to resolve before seeking run approval

1. **Cleanup settlement — blocker.** After an aborted request, the tracked
   raw fetch can settle before a binding's late-response `cancel()` promise.
   A no-network reproduction showed `cancel-start`, then `tracker.settle`,
   then `cancel-settle`. Add a regression proving the terminal journal stays
   at intent until cancellation settles. Make the smallest bounded tracker
   correction and obtain independent review.
2. **Deadline claim — wording and gate.** The 60-second timer begins after
   manifest verification and three credential reads; each helper can take
   15 seconds. Treat it as an observation deadline, not a guaranteed
   60-second end-to-end bound. Preflight all selectors before arming and
   reserve token lifetime for setup, observation, cleanup and disarm. A
   slow/uncertain helper read stops before journal claim. Do not enlarge
   timeouts to force a run.
3. **Exact hosted shapes — preflight gate.** Before a future arming review,
   check exact staging Supabase identity/read-only role, provider schema,
   Vercel project/Preview envelope, broker-secret absence, deployment and
   branch identity, and disabled surface flags. Record only status, counts
   and categorical matches. Unknown provider fields, malformed pagination,
   mismatched Preview rows or changed deployment are HOLD for investigation.
   Do not patch a parser while armed. V7's 16 real Preview rows matched
   branch/type, so inherited rows are a drift watch, not a diagnosed defect.
4. **Expected outcome.** Provider enabled/JWKS and absent application
   manifest are known HOLD reasons. A classified `OBSERVATION_RECORDED`
   HOLD is useful evidence; it does not authorize activation.
   `OBSERVATION_FAILED`, generic classification, uncertain cleanup or an
   intent-only journal ends the exception. No automatic retry or v9.
5. **One-shot custody.** Verify v8 journal absent, v7 hash unchanged,
   manifest pins current, native gates false and exact arming diff reviewed.
   Do not run ordinary tests armed. Invoke the direct launcher once only
   after separate action-time approval; disarm and reconcile regardless of
   outcome. Preserve any intent-only journal.

## Offline work unit and acceptance

Only `scripts/staging-account-hosted-baseline-session.mjs`, its focused
test, hosted manifest generator/test, generated hosted manifest, this plan,
the v8 preparation plan and handover may change. Before code mutation verify Git status, false gates,
v8 absence and v7 hash. Add a deterministic regression first; it should
fail against current code. Correct `settle()` so it waits until a late
response's cancellation settles, while preserving rejection/uncertainty
handling. Run focused and full disabled tests, both manifest checks and
`npm run check:live-boundaries`; obtain independent read-only review. If
the defect cannot be reproduced or a fix introduces an unbounded wait,
stop and revise this plan. No credential, hosted read or external mutation.

### Bounded cleanup amendment after red/green reproduction

The original code already awaited cleanup without a wall-clock bound; the
new late-cancellation tracking makes that pre-existing gap more visible.
The independent code review confirmed the 60-second observation abort does
not bound the later `dispose()` await. Keep tracker settlement truthful,
but add a separate fixed 5-second cleanup grace to the session and manifest.
Start disposal once, wipe session-owned credential buffers as soon as
disposal is initiated, and race the handled disposal promise against that
grace. On expiry, return fixed `RECONCILIATION_REQUIRED` with
`cleanup_timeout`, leave the journal at intent and never write terminal
evidence. A later disposal rejection must remain handled. Add an injected
timer test where cancellation never settles; prove credentials are zeroed,
intent remains, and the function returns without claiming cleanup success.
Also retain the resolving/rejecting late-cancellation regressions. This is
still disabled-only work; the new deadline does not authorize a run.

## Verified result and confidence gate

The regression failed on the prior tracker: `settle()` returned after
`cancel-start` but before `cancel-settle`. After the bounded quiescence
change it passed. A resolving late cancellation keeps the session journal
at intent until cleanup finishes; a rejecting one remains uncertain. A
never-settling disposal now returns fixed `cleanup_timeout` after the
separate five-second grace, wipes session-owned credential buffers and
preserves the intent-only journal. The 60-second observation timer remains
separate and is not described as an end-to-end launcher bound.

Focused session tests passed 24/24, the full disabled suite 2,261/2,261,
both manifest checks passed, and the live-boundary check reported zero
violations. The generated manifest pins the five-second grace and all 23
source hashes. Independent read-only review returned GO for this exact
disabled diff. It additionally tested a disposal rejection after grace
expiry and an actual Vercel binding with late abort/cancellation rejection;
both preserved intent and produced no unhandled rejection. V7's journal
hash remains unchanged and v8's journal is absent.

This closes the **demonstrated cleanup-settlement defect**, but does not
identify v7's historical validation trigger. Confidence for a v8 hosted
diagnostic is still conditional on a fresh exact-endpoint/role/schema
preflight, valid short-lived credentials with sufficient time remaining,
and independent review of the exact arming diff. Any mismatch stops before
journal claim. No hosted execution is approved by this result.
