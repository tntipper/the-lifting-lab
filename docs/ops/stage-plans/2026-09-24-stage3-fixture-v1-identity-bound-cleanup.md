# Stage 3 fixture V1: identity-bound cleanup plan

## Outcome and scope

Remove only the preserved synthetic Keychain V1 and its known zero-byte sidecar, then remove their empty private directory. Preserve both consumed V1 test journals. A successful cleanup leaves the user's default Keychain and user search list unchanged and the fixture path absent, permitting planning of a new synthetic test. This cleanup does not authorize that test, provider mutation, account/cart activation, production changes, purchases or messages.

Apple documents `SecKeychainDelete` as removing a file-based Keychain and its search-list entry. Use it for the main file, then independently inspect whether the known sidecar remains. Do not assume the API removes a sidecar. Its behavior on this file remains an explicit uncertainty. ([Apple SecKeychainDelete](https://developer.apple.com/documentation/security/seckeychaindelete%28_%3A%29), [Apple SecKeychainOpen](https://developer.apple.com/documentation/security/seckeychainopen%28_%3A_%3A%29))

## Authoritative baseline to recheck

- Repository `implementation-integration`, branch `codex/tll-integration`, disabled HEAD `481e153735c9da8a4b3a9776121c630f730de1b9` at plan creation. Keep all native/fixture/provider/account/cart gates false before ordinary checks. Preserve six unrelated untracked paths listed in `.agent/HANDOVER.md`.
- Terminal parent journal: run `c02a3356-3c57-4d1f-adee-eb940cf1f87a`, `LOCAL_RECONCILIATION/HOLD`. Terminal native journal: `CREATE/COMPLETE/HOLD`, sequence 1. Never replay either.
- Fixed directory: `~/Library/Caches/tll-stage3-keychain-fixture`, owner UID 501, mode `0700`, device `16777234`, inode `144003366` at plan creation.
- Main leaf: `tll-stage3-fixture.keychain-db`, regular, UID 501, one link, mode `0644`, device `16777234`, inode `144003379`, size `20460`, SHA-256 `eaf94db34cc0094496532ee781babd1a551ce248abe6815792f1f1a0b79b3c42` at plan creation.
- Sidecar leaf: `.flA673ACC0`, regular, UID 501, one link, mode `0444`, device `16777234`, inode `144003377`, size zero, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` at plan creation.
- Directory contains exactly those two leaves. The default Keychain and one-entry user search list both name `login.keychain-db` and must not be changed by cleanup.

These identities are preconditions, not values to trust indefinitely. Refresh them read-only immediately before arming. If the file, sidecar, directory, journal or search list has changed, HOLD and revise this plan. Hashing the fixture is allowed because V1 stopped before creating any item; do not output or inspect real Keychain contents.

## Disabled implementation and pre-execution checks

Create a dedicated `*-live-launcher.mjs` with gate false, an injected-only coordinator and a new owner-only one-use recovery journal. The launcher pins only the path and three leaves above. It checks exact owner, file type, link count, mode, size, device/inode and main hash; sidecar must be empty and exact; the directory must contain no extra entries. A native fixed-target helper opens a directory descriptor with `O_DIRECTORY | O_NOFOLLOW`, verifies it against the captured identity, and resolves leaves with `fstatat`/`openat` or equivalent. The source/build/check identity must be bound to the current checkout and kept separate from the test fixture binary. It must never read a credential or accept arbitrary path/selector arguments.

The parent journal must durably record an intent before each effective phase: `API_DELETE`, `SIDECAR_RECONCILE`, `DIRECTORY_REMOVE`, `FINAL_RECONCILIATION`. Bound the total window and each child; no retries. Before `SecKeychainDelete`, the native helper must disable interaction, open only the exact synthetic keychain path, check the returned path and the pinned main-file identity again, then invoke the API once. A child timeout or uncertain acknowledgement stops all later mutations. After a known API result, read the directory again. If the main file remains, HOLD; never unlink it as fallback. If the sidecar is already gone, record that. If it remains with the exact pinned identity and zero size, remove it through the anchored directory descriptor once. If any other file appears or the directory identity changes, HOLD. Remove the directory only if it is the same empty directory. Reconcile the default/search list at every boundary and after the final phase.

Before each native dispatch, recheck the current source-bound executable identity and reserve the whole child timeout against the already-running phase and run deadlines. A slow preflight or reconciliation must never renew an expired phase. The native helper must verify the actual executable bytes and both preserved V1 journal identities. A failed first restoration of Keychain interaction is a HOLD even when a best-effort second restoration succeeds.

Prepare injected/offline tests for positive and negative identity checks, symlinks, hard links, changed inode/content, unknown extra files, API failure, child timeout, journal replay, sidecar already absent/present and directory replacement during cleanup. Tests must not import the live launcher or call Security.framework. Run full tests, typecheck, targeted lint, manifest `--check`, live-boundary and source-bound disabled-build checks. Independently review the disabled diff, then the exact minimal arming diff. Do not run ordinary tests while armed.

## Single recovery window and stop conditions

After fresh baseline, exact independent review and owner action-time approval, commit the reviewed arming diff locally and invoke the direct launcher once. Do not push. Preserve the new recovery journal regardless of PASS/HOLD/UNCERTAIN. On known failure, reconcile read-only and retain any remaining file. On timeout, do not start a second child or delete anything until a separate investigation. Disarm, verify all live gates false, commit the evidence and update `.agent/HANDOVER.md`.

The pathname-based sidecar and directory removal cannot atomically require a particular inode. Execute only in an exclusive recovery window with no other fixture process or cleanup attempt, and recheck the anchored identities immediately before each removal. A replacement or unexpected entry is a HOLD.

No cleanup is authorized by this document alone. The existing fixture remains preserved until the disabled code, tests, independent review and action-time permission are complete.
