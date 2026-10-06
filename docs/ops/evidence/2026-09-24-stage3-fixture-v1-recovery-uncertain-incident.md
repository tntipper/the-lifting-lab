# Stage 3 synthetic fixture V1 cleanup — uncertain child result

Status: **OPEN / HOLD**. Do not replay recovery run `85e3c7f3-ce62-4081-bf63-7084695a68c9`, create another deletion journal, or manually remove the fixture. The one-run arming commit `2d49dcf` was reverted at `f1f40bd`; all repository live gates are false and live-boundary and activation-manifest checks passed. No production, customer, supplier or purchase action occurred.

## Observed result and external state

After fresh exact fixture, Keychain-baseline, patch and armed-artifact checks, the owner-approved launcher was invoked once in `implementation-integration`. It returned `{"status":"UNCERTAIN","category":"CHILD"}` in 0.58 seconds. The new mode-0600 journal is terminal at `API_DELETE/UNCERTAIN`, sequence 2, with a 527 ms start-to-terminal interval and about 492 ms after API intent. This does not support a normal child timeout or phase deadline expiry. The native child did not emit the exact success receipt; its specific exit/signal/output classification was not durably recorded.

Separate read-only reconciliation found the original synthetic Keychain main file, zero-byte sidecar and parent directory unchanged at their pinned device/inode, owner, mode, size and SHA-256 identities. The default Keychain and sole user search-list entry remained `login.keychain-db`. The original V1 fixture journals remain terminal. The actual deletion did not complete, but this evidence does not prove whether `SecKeychainDelete` was entered or returned.

## Cause, process learning and uncertainty

The **diagnostic cause is confirmed**: `classifyRecoveryChild` and the session reduced every native startup, guard, API, verification and restoration failure to `UNCERTAIN/CHILD`. The native helper itself emitted only broad exit codes `30`/`31` on failure. The execution plan accepted this information loss even though a failed one-use window would need a precise cause before any successor. The **underlying native failure is not established**. Plausible points include journal/build guards, Security.framework default/search-list path representation, file identity checks, `SecKeychainOpen`, `SecKeychainDelete`, post-delete verification and interaction restoration. A path-format mismatch is only a hypothesis; do not weaken exact comparisons on that basis.

The preventive work required before a successor deletion is: fixed secret-free exit/result categories recorded durably; explicit distinctions between deletion never called, called with unknown result, and returned success but verification/restoration failed; injected tests of the actual native journal and deletion coordinator; and a separately reviewed metadata-only native preflight that cannot call deletion. The preflight should compare the native default/search-list representation to the exact expected login Keychain and report only fixed categories, never a path, token or credential. Preserve the consumed journal and fixture throughout. Independent Astra review confirmed this HOLD and these recovery requirements; no helper was rerun.

## Next gate

Write and review a separate disabled diagnostic plan, then implement and test its read-only native path while all mutation gates remain false. Do not ask for another cleanup run until the underlying failure is identified or the remaining uncertainty is made observable and a new bounded execution plan has been independently reviewed and approved at action time.
