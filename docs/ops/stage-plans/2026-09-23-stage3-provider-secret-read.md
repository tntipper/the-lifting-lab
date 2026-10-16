# Stage 3 provider update key read — disabled preparation

## Outcome and limits

Expose one bounded, fixed-target, read-only way for the future provider-normalization launcher to obtain the staging project's legacy service-role key from Supabase Management API. Reuse the existing `api-keys?reveal=true` parser and HTTP limits already used by the hosted baseline provider GET. Return a private Buffer to the one-shot launcher, which must wipe it after the run. This unit changes no hosted state, performs no credential lookup in tests outside synthetic ports, and keeps all live flags false. Production, purchases, customer communication, supplier orders and deployment are excluded.

## Starting state and rationale

Local branch `codex/tll-integration` is at `676de0d` with unrelated untracked files preserved. The approved disabled preflight/phase/intent/coordinator packages exist; hosted arming is HOLD. `createStagingAccountHostedBaselineSupabaseBinding` already bounds the Management API `api-keys` response, selects exactly one `service_role` record with `type: legacy`, and wipes parsed key strings after constructing a Buffer. Its existing provider GET repeats that read on each call. The future launcher can instead read once and use the reviewed official native port for pre-read, one update and post-read, reducing credential requests while keeping the key in memory for one bounded session.

## Small change and verification

Add `readProjectSecret({signal})` to that injected Supabase binding, using the exact existing request and selector. It must reject disposed/aborted binding, wrong response framing or ambiguous/missing key and return only the Buffer; no key may appear in errors or logs. Add synthetic tests for exact URL, selected key, wipe of raw parsed strings, duplicate/missing records, abort and disposal. Pin changed source and tests through the generated activation manifest. Run focused/full disabled tests, typecheck, lint, both manifests, live-boundary and diff checks. Obtain independent review of this widened read capability before launcher wiring.

## Next gate

The future launcher must keep the Buffer private, pass it only to one native-port instance, wipe it in `finally`, and never persist it in either journal. It must separately prove phase deadlines, cancellation and post-intent no-retry behavior. This plan does not authorize credentials, access changes or provider mutation.

## Independent-review correction

The first review returned HOLD: `readProjectSecret` could return a key after the binding had been disposed while an HTTP response was pending. The older `request` guard checked disposal only before awaiting, and the new method assumed that was sufficient. A synthetic delayed response reproduced late key delivery. No hosted request or credential was used. Recheck disposal and abort after selecting the key but before returning it; if either changed, wipe the Buffer and fail with the fixed error. Add in-flight fetch and body-read disposal regressions and re-review before launcher wiring. This turns binding teardown into a post-await invariant rather than a one-time entry check.

The corrected read now checks disposal/abort after selecting the key and wipes the Buffer before a fixed rejection. Deferred-fetch and deferred-body tests pass. Independent re-review returned **GO for disabled launcher wiring**, HOLD for hosted arming. The full disabled suite initially caught a stale hosted-baseline manifest pin after the source change; both manifests were regenerated in dependency order. Focused reader/manifest 19/19, full disabled 2,348/2,348, typecheck, both manifests and live-boundary passed; lint had zero errors and 20 existing warnings. No actual credentials or hosted state were accessed.
