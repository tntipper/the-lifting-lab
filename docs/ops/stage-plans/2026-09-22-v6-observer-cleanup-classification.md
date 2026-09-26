# Full observer v6 source correction before any new window

## Outcome and acceptance

Correct the local cleanup classification that can leave a consumed staging
observer journal at intent and hide the first safe read failure. This is a
disabled source/test unit only. Accept when a native errored Web Stream's
rejected read and cancel settle without false custody uncertainty, an
arbitrary rejected cancel without terminal proof still requires
reconciliation, and a genuine cleanup failure returns a fixed, secret-free
diagnostic code while retaining the intent journal. A failing concurrent read
must abort and settle sibling operations. Focused and full disabled checks,
generated manifest check and live-boundary check must pass before review.

## Starting evidence and exclusions

V5 run ID `11c13cc4-d008-461c-9363-c9179545a08b` remains consumed at
`INTENT_RECORDED` in the mode-0600 journal. It returned
`RECONCILIATION_REQUIRED`; no initiating provider failure was established.
The launcher and Keychain helper are disabled. Supabase and Vercel project
identities were separately confirmed with read-only HTTP 200 requests. The
local API Keychain item was removed; the retained bypass remains but its
temporary `/usr/bin/security` allowance was removed. No token or bypass
credential is available for another window under this stage. No hosted call,
provider/database/Vercel write, deployment, Shopify action, purchase,
customer message or production request is allowed here.

## Exact mutation and checks

Only `scripts/staging-account-hosted-baseline-session.mjs`, its focused test,
the generated hosted-baseline manifest, and this stage plan may change.
Preserve the v5 journal and existing schema. Implement terminal-stream proof
using the native reader lifecycle while remaining fail-closed on arbitrary
cancel rejection; do not classify by error name. Keep a fixed diagnostic
reason separately from cleanup outcome and return only that code if intent
must remain open. Never retain a raw exception, URL, provider response or
credential. A local test must reproduce the native errored-stream behavior
reported by independent review and cover the genuine uncertainty case and
concurrent sibling settlement.

Before editing, inspect the exact current source and tests and verify the
disabled boundary. After editing, run focused tests, regenerate/check the
manifest, run the full suite and boundary check while disabled, then obtain
independent review of the diff. On any failure, diagnose and change the
smallest cause; do not create a v6 journal or credential until these local
acceptance checks pass. Record the result in the canonical handover.

## Disabled correction result

The first implementation accepted either fulfillment or rejection of
`reader.closed` as terminal proof. Independent review reproduced a native
stream whose underlying `cancel()` throws after `reader.closed` fulfills;
that implementation incorrectly accepted the failed cleanup. The final
correction accepts only `reader.closed` rejection before lock release as
proof of an already-errored stream. Native failed-underlying-cancel and
release-lock regressions retain fail-closed behavior. The fixed first-read
code is returned as `diagnosticReasonCode` if a separate cleanup failure
leaves the journal at intent; raw errors are not returned. An existing
composition test verifies sibling abort and settlement. Focused checks
passed 32/32 and the full disabled suite 2,254/2,254; generated manifest
and live-boundary checks passed. Independent review gave GO for this
disabled source package. This evidence does not identify v5's initiating
hosted error or authorize another hosted attempt.
