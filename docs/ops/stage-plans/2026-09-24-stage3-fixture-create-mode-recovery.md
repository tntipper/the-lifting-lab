# Stage 3 fixture CREATE-mode incident: disabled recovery plan

Disabled correction result: independently reviewed GO, with the directory-replacement race found in first review and fixed before final checks. Full suite passed 2,468 tests with two skipped; typecheck, targeted lint, activation manifest, live boundary, disabled binary identity and diff checks passed. Existing fixture cleanup and any new live run remain HOLD.

## Observed outcome and boundary

The owner-authorized one-run synthetic Keychain fixture returned `HOLD/CLEANUP`. Its parent journal is terminal at `LOCAL_RECONCILIATION`; its native journal ended `CREATE/COMPLETE/HOLD` with sequence 1. The fixture Keychain file exists under the intended owner-only cache directory, but macOS created it with mode `0644`. The native identity guard explicitly requires group/other permissions to be zero, so this observed mode is sufficient to explain the rejected CREATE phase. No allowed/missing/denied/locked read phase began. The default Keychain and user search list remained the login Keychain. The exact arming commit was reverted and disabled-boundary and manifest checks passed.

The immediate goal is to correct the CREATE-mode assumption in **disabled code**, independently review it and preserve the consumed journals and existing fixture for separately reviewed recovery. Do not rerun the fixture, read a real credential, perform provider mutation, enable account/cart, delete the existing fixture, make a purchase, or send a customer message in this work unit.

## Cause and learning

Direct supported cause: after `SecKeychainCreate`, the new file had mode `0644`. That mode would necessarily fail `TLLFixtureFileIdentity.read` because it checks `(mode & 0o077) == 0`. The receipt records only CREATE/HOLD, so other guards in that same operation have not been individually excluded. The process gap was an untested assumption that Security.framework would create an owner-only file; the approved synthetic run itself was intended to qualify framework behavior. The owner-only parent directory limited access, and the content was synthetic; nevertheless the fixture was left in place by the deliberate fail-closed cleanup rule because its identity had not been verified.

Preventive control: after creation, validate the exact file path and owner-only directory identity, open and verify the directory with `O_DIRECTORY | O_NOFOLLOW`, resolve the fixed leaf through that descriptor with `fstatat`/`openat`, prove regular-file/owner/single-link/device/inode identity, tighten only that verified descriptor to `0600` with `fchmod`, sync, recheck the descriptor, path and directory identity, then mark the fixture verified. A failure at any check remains HOLD and preserves the file. Offline synthetic-file tests start at `0644`, prove tightening to `0600`, reject a symlink and wrong directory identity, and replace the directory during the operation to prove the replacement file is never chmodded. Ordinary tests must not create a Keychain or execute the live fixture main.

## Execution order and evidence

1. Keep all live gates false; verify branch/HEAD, journals, fixture file/sidecar identity and default/search-list metadata read-only. Preserve the existing fixture and one-use receipts.
2. Implement only the CREATE-mode helper/native call and its offline tests. Update the activation manifest and plan evidence. Run focused tests, full `npm test`, typecheck, targeted lint, disabled-build/check, live-boundary and diff checks.
3. Independently review the disabled fix and the incident record. Rebuild the disabled private binary under a new source-bound receipt without overwriting older artifacts.
4. Stop. A separate recovery plan must first reconcile and safely remove the *existing* fixture and its sidecar. Only then may a new identifier, journal, exact patch, fresh baseline and action-time approval be considered for another synthetic run. The incident gate remains OPEN/HOLD until the actual framework mode, cleanup behavior and expected read categories are proved.

There is no deadline or execution command for a new live test in this plan. This unit is disabled preparation only.
