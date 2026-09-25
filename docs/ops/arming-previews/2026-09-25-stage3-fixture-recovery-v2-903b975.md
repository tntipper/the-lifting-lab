# Stage 3 synthetic fixture recovery V2 — one-run review proposal

**Status: PREPARED, NOT APPLIED IN THE MAIN CHECKOUT. NO CLEANUP AUTHORISED.** This proposal is limited to the preserved synthetic Keychain fixture on this Mac. It does not change Shopify, Supabase, Vercel, customer accounts, orders, email, or production.

Disabled source commit: `903b975315c55960d9013508a9d52738b3c088c2`. The proposed patch was saved temporarily at `/tmp/tll-stage3-fixture-recovery-v2-arming-903b975.patch`, with SHA-256 `e19427655b95df63b1e212ca0a84c7f90257d84b7fea0758df1525cccd15c06c`. It is not a durable project artifact; regenerate and independently compare it with this record if it is missing. It changes exactly four values in three files:

| Value | Disabled | One-run proposal |
| --- | --- | --- |
| Native V2 recovery switch | `false` | `true` |
| V2 live-launcher switch | `false` | `true` |
| Manifest pin for native V2 source | `a883a26309563ed36292bd55c52bc1d9c015ce6f03962892a4a90f64e0d2e66a` | `c39bec70c0167a0e8778f930829bf714f8ea07ab31fbbcd0d746208e1d2a2cf8` |
| Manifest pin for V2 launcher | `09ed734588d1dc69a9f0457061b3ef4f06b1a6f776bd44a77579944bb23bafbf` | `f9aaf76b6d5cdc03a84b0a6f7c24b47debe968dc6e17b29099e806245b21988f` |

The proposed patch was generated in a detached review checkout from that exact commit. `git apply --check` passed against the still-disabled main checkout. The review checkout must **not** execute the launcher: the native program is bound to the `implementation-integration` checkout name.

## Fresh read-only baseline — 2026-09-25 12:02 UTC

The main checkout was at the disabled commit above, with only six preserved unrelated untracked paths. The fixed V2 fixture observation returned PASS: exact preserved directory/main/sidecar identities and contents; default login Keychain; one explicit user-domain search-list entry; both V1 records terminal/HOLD; owner-only private state directories; and absence of all four V2 journal, baseline, armed binary and receipt paths. The Mac's complete *effective* native Keychain list was **not** reread by this observation. V2's journalled capture would read and pin it at run start. This baseline is point-in-time evidence and must be refreshed immediately before any execution.

The disabled native source compiled to a temporary arm64 executable and `codesign --verify --strict` passed. This did not build or save an armed binary and did not invoke the native program. Existing disabled preparation passed 25 focused tests, the full suite (2,534 passed, 2 skipped), TypeScript/Swift typechecks, targeted lint and the live-boundary check; see the [preparation result](../evidence/2026-09-25-stage3-fixture-recovery-v2-disabled-result.md).

## Proposed one-run sequence, only after independent review and explicit owner approval

1. In the main checkout, recheck branch, exact source contents, clean tracked files, the six unrelated untracked paths, absence of V2 artifacts, fixed fixture identities, default/user Keychain settings, and both terminal V1 records. Any mismatch is HOLD. Recheck patch hash and `git apply --check`.
2. Apply only the reviewed patch to the main checkout. Verify the diff is exactly the two switches and two manifest hashes; verify `staging-account-activation-manifest.mjs --check`. Do not run ordinary tests while either switch is on.
3. In a **separate process**, build the one armed V2 binary with the fixed V2 builder. Verify its source/binary receipt, arm64 architecture and strict signature. If any check fails, disarm without running.
4. In another **separate process**, invoke the fixed V2 launcher **once**, without arguments. It creates a fresh one-use V2 journal, captures one full native Keychain baseline, then attempts only the pinned synthetic main-Keychain API deletion, sidecar reconciliation, empty-directory removal and read-only final verification. It stops on changed identity, Keychain drift, timeout, unexpected child result or uncertain postcheck. No retry is allowed.
5. **Disarm unconditionally** after a build attempt, launcher attempt, readback failure or interruption: reverse the reviewed patch in the main checkout and verify both switches are false and manifest/live-boundary checks pass. If an interruption prevents immediate disarming, disarming is the first action on resumption, before any other work. Separately read back the V2 journal and exact fixture/Keychain status without changing them. Preserve journal, baseline, binary and receipt as private evidence. A missing, active, HOLD or UNCERTAIN journal after attempted execution is uncertainty, not permission to retry. Do not remove remaining files by hand or start another run; investigate from read-only evidence.

Even a terminal PASS retires only this synthetic fixture. Provider normalisation and account/cart activation retain their separate Stage 3 gates. No purchase or customer message is in scope.
