# Stage 3 synthetic fixture recovery V2

Status: **ONE-RUN CLEANUP PASS; JOURNAL CONSUMED; BOTH SWITCHES DISABLED**. The separate V2 package passed offline review and checks, then its one owner-approved cleanup attempt succeeded on 25 September. The preserved synthetic fixture is now absent; the login/default and explicit user Keychain settings remain intact. See the [one-run result](../evidence/2026-09-25-stage3-fixture-recovery-v2-one-run-result.md). Stage 3 provider/account/cart remains HOLD.

## Why V2 is required

V1 rejected this Mac's normal two-entry effective search list because it expected only login. Its disabled phase-local correction now permits unrelated entries and detects changes *within* a phase, but each child process takes a fresh starting picture. A change between phases could therefore be accepted. V2 must keep one original picture throughout the entire cleanup.

## Safety contract

1. Keep V1 source, journals, binary and receipts separate and never replay them. V2 uses distinct fixed names, schema, gate, build, journal, baseline file and launcher.
2. Before any deletion, durably record one run intent, then capture the selected preference domain, default Keychain, complete ordered effective search list and explicit user search list. Each list entry includes its exact path and file identity. Reject unreadable/nonregular entries, duplicates, login aliases, and either fixture-file identity. Save the full snapshot in an exclusive owner-only private file. Never print paths.
3. Bind the snapshot's SHA-256 to the same run ID and exact source/binary identities in an exclusive one-use phase journal. The digest is an integrity check, not a substitute for reading and comparing the full snapshot.
4. Every native child must validate the fixed snapshot file and journal, then compare its current Keychain picture to that original snapshot before any destructive call, immediately before the call, and after the call. A mismatch or uncertain postcheck terminates the run; no new baseline is accepted.
5. Before each later child, the parent must verify the same pinned baseline and source/binary. After the last phase, a separate native read-only final check and parent reconciliation must agree. Protect the original user list and unrelated effective-list entries.
6. A private baseline-file or journal mismatch, expired deadline, unexpected output, prompt, interrupted child, fixture identity change or absent completion record is HOLD/UNCERTAIN without replay. No unlink fallback for the main Keychain.

## Small verified slices

1. Define and test the V2 one-use journal and immutable snapshot-file contract with injected file and clock adapters. Prove a changed digest, run ID, source or binary blocks a later phase.
2. Create a distinct hard-disabled V2 native source/build. Use the reviewed V1 file checks as a starting point, but make all journal, snapshot, receipt and executable identities V2-only. Test baseline capture and comparison with injected lists; test changed entries *between* each phase and after deletion.
3. Add a distinct hard-disabled V2 launcher/session with exact phase order, timeouts and a read-only final native check. Test failures and uncertain results block every later destructive callback. Pin new files in the activation manifest and live-boundary checker.
4. Obtain independent review of the disabled package and fix findings. Run focused tests, native typecheck, full suite, manifest and boundary checks. Record only the verified result.

The reviewed V2 arming patch was used once and reversed. The V1 and V2 terminal records are consumed; do not replay either cleanup.
