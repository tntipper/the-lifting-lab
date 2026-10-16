# Stage 3 provider normalization — disabled session wiring

## Outcome and boundary

Wire the reviewed staging-only preflight, official provider port, provider intent journal and dedicated phase journal into one bounded, injected session. Build no enabled entry point or ambient credential/network lookup in this unit. Tests use synthetic Buffers/fetch/ports and temporary journals only. Maximum hosted attempts: zero. Production, purchases, customer messages, supplier orders and deployment are excluded.

## Starting state and decisions

At local HEAD `5080c03`, the source components each have independent GO for offline continuation. Hosted arming is HOLD. The Supabase binding now permits one bounded service-role key read, and the future session must wipe the returned Buffer in `finally`. The official provider port can use the same key for GET, the single two-field update and an independent GET, avoiding repeated Management API key retrieval. Existing unrelated untracked files and consumed journals remain untouched.

The phase journal begins before any credential read. Its current `LAUNCH_STARTED` deadline is 15 seconds, which cannot safely accommodate three bounded Keychain reads plus one Management API key read. Change only that deadline to 60 seconds and review the change with the full session; other deadlines remain 45/30/10/30/10/45 seconds. The complete bounded run remains well within a one-hour temporary token window.

## Session contract

- Inject `readCredentials`, concrete fixed-target binding factories, provider-port factory, the two journals, clock and timers. The session itself has no default transport, environment access, Keychain helper, or CLI.
- Check both journals for prior or malformed records before effects. Start the phase journal before credential reads. On any failure to start, do not read credentials.
- Read only the three named access Buffers, then obtain the project key through one fresh fixed Supabase binding; close that binding. Reject malformed material and wipe every owned Buffer on all outcomes.
- Create the read-only preflight adapter with fresh binding factories and one session AbortSignal. Use the official provider native port with one key Buffer and a bounded executor that passes the same signal. Its fetcher must be injected and target-bound by the native port.
- Wrap coordinator ports/journal methods so the phase sequence is durable before work: `PREFLIGHT`, `PROVIDER_PREREAD`, `INTENT_RECORDED`, `UPDATE_DISPATCH`, `UPDATE_ACKNOWLEDGED`, `POSTREAD`. Before each phase transition or effect, check the current phase has not expired. The update wrapper cannot dispatch without a valid provider intent journal record and `UPDATE_DISPATCH` receipt.
- Revalidate the captured initial preflight's 30-second age **after** the `UPDATE_DISPATCH` phase write and immediately before the native update call. The coordinator's own freshness check precedes that write, and a slow durable write can consume the remaining window while the new phase itself is still within its deadline. Expiry must consume intent and reconcile with zero update calls.
- Use phase-specific timers that abort the session signal and settle the caller on deadline. A late update response is uncertain: never retry or infer success. Any failure after provider intent is reconciliation-required. A mismatch between the two journals is reconciliation-required. Finish `VERIFIED` only when the coordinator is verified and the phase journal remains within deadline; otherwise record reconciliation if possible.
- Return only fixed status/target/provider identifier; no credentials, URLs, raw provider payload, or raw exceptions in result/journals/logs.

## Verification and review

Test success with synthetic readers and real temporary journals, wrong target/unsafe preflight, credential/secret read failure, aborted or delayed reads, update timeout/late acknowledgement, journal write failure, replay, phase expiry and cleanup/wiping. Pin source/tests through activation manifest. Run focused/full disabled suites, typecheck, lint, both manifests, live-boundary and diff checks after final changes. Independent review of exact disabled session and deadline change is required before a separate disabled `*-live-launcher.mjs` is created. No hosted action or credential window is authorized by this plan.

## Native executor review correction

Initial independent review returned HOLD: the session supplied a bare callback value to the real native port, which requires an exact `{status:'COMPLETED', value}` executor receipt. A synthetic `makeNativePort` stub did not enforce that contract, so the local success test masked an actual first-GET failure. No hosted call occurred. Return the exact receipt from the shared-signal executor, and add a session composition regression that instantiates the real official SDK native port with synthetic HTTP GET/PUT/GET responses. Re-review the corrected integration before proceeding.

The corrected session is at `scripts/staging-provider-normalization-session.mjs`. It starts the phase journal before credential reads, bounds each operation with one shared abort signal, composes the fixed preflight and official native provider port, records intent before one update, and wipes credentials/project key on exit. A final dispatch-time baseline check covers delay during phase persistence. The real native-port composition test passes GET → one PUT → independent GET. Independent re-review returned **GO for the disabled session source** and HOLD for hosted arming; its only checkpoint request was to regenerate the stale activation manifest. That pin was regenerated. After a nonbehavioral unused-import cleanup, focused session/phase/manifest tests passed 22/22 and the full disabled suite passed 2,355/2,355. Typecheck, both manifest checks, live-boundary and diff checks passed; lint reported zero errors and 20 existing warnings. No credential window or hosted request was opened.
