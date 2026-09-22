# V8 one-time diagnostic observer — disabled preparation

## Outcome and acceptance

Prepare one isolated, read-only staging observer under the owner's
2026-09-23 exception-preparation decision. The only purpose of a later
separately approved run is to obtain a fixed stage label or a legitimate
HOLD/PASS receipt after v7's generic failure. Preparation is complete when
the v8 journal path is fresh and absent, all native gates are false, the
manifest pins match, focused and full disabled checks pass, and an
independent reviewer accepts the exact disabled package.

## Starting state and assumptions

Start at `bd5362d` on `codex/tll-integration`; verify branch, HEAD,
working tree and remote before editing. The v7 journal is terminal,
mode 0600, SHA-256
`d53760204f68ca4949af4be340f2dadaf4e3442abe24b91a6eb66e5f6c4d6084`.
The v8 path must be absent. The hosted baseline launcher and native Keychain
helper are disabled; the generated manifest declares native access false.
The v7 failure stage remains unknown. The diagnostic classification and
concurrent replay are independently reviewed but do not prove v7's live
trigger. The staging provider enabled/JWKS state is an expected HOLD, not
an authorization to change it.

## Allowed changes and exclusions

Change only the full observer's journal path from v7 to v8 in the session
constant, hosted manifest generator, generated hosted manifest and manifest
test; update this plan and `.agent/HANDOVER.md`. If another source/test pin
must change, pause and revise this plan. Preserve all older journals and
unrelated untracked iCloud copies. Do not create the v8 journal during
preparation. Do not change provider state, broker secrets, database,
deployment, Shopify, customer email, supplier orders, production or pricing.
No purchase. No credential creation, Keychain access grant, arming or hosted
observer invocation is approved by this preparation decision.

## Pre-mutation checks and execution

Verify Git identity/status, v7 hash/mode, v8 absence, false launcher/helper
gates and current manifest check. Record exact path-only source changes.
Rotate only the journal constant/generator/test to
`../implementation-state/staging/tll-hosted-baseline-observation-v8.json`.
Regenerate the hosted manifest while disabled, then run the focused hosted
manifest/session/composition tests, full `npm test`, both manifest checks
and `npm run check:live-boundaries`. Maximum preparation attempts: one
coherent edit/correction loop; do not invoke the live launcher.

## Failure, review and next gate

Any existing v8 journal, enabled gate, stale/incorrect pin, failed test,
changed hosted state or mismatch between this plan and actual diff stops
preparation. Restore no journal and replay none. Diagnose a failure before
another edit. Obtain independent read-only review of the exact disabled
diff and evidence, then commit and update handover only if accepted.

This plan does not authorize execution. A later run requires a fresh
read-only identity/secret/Preview preflight, a one-hour scoped Vercel token
and temporary specific Keychain reader allowance approved at action time,
review of the *exact minimal arming diff*, a new commit, and at most one
60-second launcher invocation. Ordinary tests must not run while armed.
The result must be disarmed, journal-reconciled and read-only verified
before any further Stage 3 action. A generic failure or uncertain cleanup
stops the exception; no v9 or automatic retry follows.

## Disabled preparation result

The three reviewed source/test edits changed only `v7.json` to `v8.json`;
the generated hosted manifest changed that path and the corresponding three
source hashes. The v8 file remains absent. V7 remains terminal, mode 0600,
single-link, at its starting hash. The launcher and Keychain gates and
manifest native approval remain false. The staging target, production
exclusion, 60-second deadline and zero retries are unchanged.

Focused hosted tests passed 34/34; the full disabled suite passed
2,257/2,257. Both manifest check modes pass and the live-boundary check
reports zero violations. Independent read-only review returned GO for the
exact disabled package and confirmed all 23 hosted source pins. Execution
remains HOLD. No token, Keychain allowance, journal claim, hosted request
or deployment was made during preparation.

## Pre-arm safety review amendment

The owner's 2026-09-23 cross-attempt review found a reproducible
late-response cancellation settlement gap. Preparation is paused at HOLD.
Before any credential window, perform the offline hardening unit in
`2026-09-23-v8-failure-prevention.md`. That unit may change the session
tracker, its focused test, generated hosted manifest, this plan and
handover while every live gate remains false. The hardening review also
found that cleanup can wait indefinitely after the observation abort; the
same unit may add a separate fixed cleanup grace to the session, hosted
manifest generator/test and generated manifest. Its regression and
independent review supersede the earlier path-only review for amended
sources. The 60-second limit above is the observation deadline after
credential acquisition, not a proven end-to-end wall-clock bound.
