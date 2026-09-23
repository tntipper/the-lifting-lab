# Stage 3 provider normalization one-shot journal — preparation

## Intended outcome

Prepare a durable, single-use staging provider normalization coordinator that cannot dispatch the two-field Auth Admin update unless fresh frozen-state evidence and a complete provider pre-read pass. It must record intent to a secret-free mode-0600 journal before dispatch, make any uncertain acknowledgement non-replayable, require a full post-update readback, and leave all live gates disabled. This document plans a **disabled** implementation; maximum hosted attempts in this unit: **zero**.

## Starting state and unresolved evidence

The pure contract and injected SDK port are at `caebad4`, subject to independent review. The exact staging provider was seen through the dashboard enabled with JWKS configured, blank scopes and identifier-as-name; the dashboard does not prove the official Admin API schema/PKCE. The database and host-secret baseline must be refreshed before a live update. The V8 observer journal is consumed and unrelated. No credential window is open. Production `wrhgscovsgsudtedbljr`, purchases, customer communication, supplier orders and deployment are excluded.

## Proposed disabled design

1. Use a new fixed journal schema and path under `../implementation-state/staging/`, distinct from the broker-rotation and V8 observer journals. A prior file at that path, whether intent, terminal or malformed, blocks a new attempt. Do not truncate, delete, reset or replay it.
2. Write an exclusive `INTENT_RECORDED` record with `open('wx', 0600)`, fsync the file and directory before the first update. Include only schema, fixed staging project/provider, run ID, UTC time, phase and a hash of the redacted preflight receipt. Never store provider URLs, JWKS, client secret, bearer tokens or raw responses.
3. Require exact fresh preflight evidence: five database controls disabled, zero runtime sessions, Edge/private/public flags disabled, broker secret name absent in both hosts, and the official Admin provider pre-read accepted by `buildStagingProviderNormalizationPatch`. The coordinator must reject an unfrozen or malformed receipt before journaling or update. All reads remain target-bound and bounded.
4. Invoke `updateProvider` through one native-port instance at most once. On a definite acknowledgement, record `UPDATE_ACKNOWLEDGED` before post-read. A transport timeout, thrown SDK result, malformed response, journal write failure or lost acknowledgement becomes `RECONCILIATION_REQUIRED`; no retry. The per-instance guard is defense in depth, not the durable authority.
5. A fresh post-read must pass `verifyStagingProviderNormalization`. Record `NORMALIZED_VERIFIED` only after it and the frozen database/secret/flag readback pass. A later separate read-only process must reconcile actual hosted state before broker rotation. If post-read is unavailable or differs, terminal state remains `RECONCILIATION_REQUIRED` and Stage 3 stays held.
6. The future live launcher must use a separate `*-live-launcher.mjs`, fixed credential selectors, a bounded executor and one reviewed arming diff. The disabled coordinator must have injected ports only and no ambient credential, process or HTTP access. Do not implement or invoke the launcher in this unit.

## Failure and recovery contract

An error **before** intent returns `STOPPED_BEFORE_UPDATE` with no journal unless exclusive journal creation itself is uncertain; in that case preserve the file and reconcile. Any error after intent returns or leaves `RECONCILIATION_REQUIRED`. Do not restore enabled/JWKS as an automatic rollback. Reconcile from a separate read-only process using the exact staging target, then decide a **new** stage identifier only after direct cause, external state, recovery evidence and preventive control have been reviewed. A consumed journal is never reused.

## Review and verification gate

Resolve the independent review of the pure contract and native port before building on them. If GO, implement the smallest coordinator/journal with synthetic tests for preflight rejection, exclusive claim, crash/timeout at each phase, at-most-one update, cross-instance replay rejection, mode/permissions, redacted fixed receipt, post-read mismatch and uncertain state. Pin its source/tests in the activation manifest. Run focused and full disabled suites, typecheck, lint, both manifest checks, live-boundary and diff checks. Obtain a second independent review of the coordinator and final arming diff before a separately approved live window. No staging mutation is authorized by this plan alone.

## Disabled journal checkpoint

Independent review of the pure contract and native port at `caebad4` returned **GO for disabled journal preparation** and **HOLD for hosted arming**. It found no actionable issue, and independently probed concurrent/uncertain update consumption and SDK error redaction. The journal primitive is now implemented at `scripts/staging-provider-normalization-journal.mjs` with a distinct fixed path, exclusive mode-0600 intent, fsync, fixed target/hash/run identity, ordered acknowledgement/verification/reconciliation transitions, and replay rejection. It contains no provider configuration or credential material and has no launcher. Focused journal/manifest tests passed 11/11; full disabled tests passed **2,327/2,327**. Typecheck, both manifest checks, live-boundary and diff checks passed; lint had zero errors and 20 existing warnings. No hosted operation occurred.

The coordinator and fresh preflight ports are **not** implemented. The journal alone cannot authorize an update, and its own review remains outstanding before building a launcher. The next unit must wire preflight, intent, one update and separate post-read under the documented failure semantics, then seek independent review of that exact disabled package.

## Independent-review incident and correction gate

Review of `848ac2f` found a short-write defect in both record creation and atomic replacement. `fs.writeSync` can return fewer bytes than requested; the first implementation ignored its return value. This was allowed by copying a single-write pattern from an earlier journal without adversarial short-write tests. No hosted action or journal at the default path was attempted, so external state is unchanged. A synthetic real-file probe proved intent could be returned despite truncated JSON, or an acknowledged transition could replace a valid intent with truncated JSON.

Before coordinator work, change both write paths to a checked write-all loop that advances by the bytes actually written and rejects zero/invalid progress. Keep fsync(file) before rename/return and fsync(directory) after. Add durable tests for repeated partial writes, zero progress and thrown writes on both creation and transition. In an interrupted creation, preserve the malformed file as a hard stop. In an interrupted transition, preserve the original intent and leftover temporary file as non-replayable uncertainty; do not delete it for retry. Re-run focused/full disabled checks and request independent re-review of the exact corrected diff. The direct cause is known; whether other journal boundary defects exist remains under review.

The correction uses a checked write-all loop in both paths. Real-file fault tests now make `writeSync` repeatedly return seven-byte partial writes, zero progress or throw during creation/transition. The partial case produces complete JSON; zero/throw never returns a success receipt, and the valid pre-transition intent remains intact. Focused journal/manifest tests passed 13/13; full disabled suite passed **2,329/2,329**. Typecheck, both manifest checks, live-boundary and diff checks passed; lint had zero errors and 20 existing warnings. The default hosted journal path was not touched. Independent re-review of this corrected diff is still required before coordinator implementation.
