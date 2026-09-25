# Stage 3 synthetic fixture: disabled metadata diagnostic

## Purpose and boundary

The consumed V1 cleanup stopped at `API_DELETE/UNCERTAIN` without identifying the native check that failed. This slice prepares a **separate, read-only** native diagnostic for the two main pre-delete hypotheses: unexpected default/search-list Keychain path representation and a changed synthetic fixture identity. It must never delete a file, open a Keychain, read an item or secret, alter Keychain interaction, use the old journal, or change the recovery helper. The existing fixture and all one-use evidence stay untouched. This diagnostic cannot explain a failure inside `SecKeychainOpen` or `SecKeychainDelete`; those require a later separately reviewed slice if the read-only result does not identify the cause.

## Smallest safe work unit

1. Add a standalone Swift diagnostic with its live entry disabled by a constant. It reads only `SecKeychainCopyDefault`, `SecKeychainCopySearchList`, `SecKeychainGetPath`, and file/directory metadata if a later reviewed run is authorised. It returns only a fixed category, never paths or values.
2. Keep classification as a pure function driven by an injected snapshot. Offline tests compile a test-only entry point and prove exact expected, missing, replacement and path-mismatch cases without touching a real Keychain or fixture.
3. Statically verify the source contains no deletion, item-read, permission-write or network call. Compile and run the offline tests, then check the repository's normal type/test and live-boundary checks. No live binary is built or invoked in this slice.

## Stop and next gate

If the offline compiler or checks fail, diagnose before further changes. A later real read requires an independent code/security review, fresh read-only fixture identity and Keychain baseline, exact source/build proof, a separate one-use plan and action-time owner approval. An inconclusive read remains HOLD; it never authorises deletion or provider activation.
