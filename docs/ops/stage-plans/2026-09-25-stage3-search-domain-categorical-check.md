# Stage 3 Keychain search-domain check

Status: **CONSUMED / DISARMED**. The approved one-run check completed and returned a two-entry effective search list against a one-entry explicit user list. Read the [result](../evidence/2026-09-25-stage3-search-domain-v1-result.md). Both this journal and the previous metadata V1 journal are consumed and must not be replayed. Stage 3 account, cart and provider changes remain HOLD.

The separate disabled native source, one-use journal, source-bound build/check, bounded launcher and offline tests passed review. The independently reviewed [four-line arming patch](../arming-previews/2026-09-25-stage3-search-domain-v1.patch), SHA-256 `2ecb413361787b9357db36dad473bda42cc8de05c91a709e8c1783b26d4a1b53`, was applied once and then reversed. **Do not reapply it.** Before the run, the focused group passed 38 tests; the full suite passed 2,517 with two skipped; typecheck, targeted lint, generated-manifest check and live-boundary check passed while both gates were false.

## Decision this check must answer

The earlier native call saw a search list different from a single exact login-Keychain path, while `security list-keychains -d user` showed only that path. The next read must establish whether that difference is due to the selected native preference domain, extra entries, or a different path referring to the same file. A result will guide the fixture-recovery design; it will not itself authorize deletion or account activation.

The cheapest read-only CLI comparison on 25 September found: explicit user list one entry (the expected login file); system and common lists one different entry each; dynamic list empty. This does **not** prove the contents of the native current-domain list or the active native domain.

## Narrow observation

The disabled Swift source `scripts/staging-provider-keychain-search-domain-diagnostic.swift` calls only `SecKeychainGetPreferenceDomain`, `SecKeychainCopySearchList`, `SecKeychainCopyDomainSearchList(.user)`, `SecKeychainGetPath`, `SecKeychainGetTypeID`, and read-only `fstatat` for file identity. It must not open a Keychain, read an item, print a path, change settings or delete a file. Its output has fixed fields for active domain, bounded list counts, exact login-path matches, same-file login matches, exact user-domain login matches, current/user list equality and whether file identities were readable. The current list is an effective list that macOS may merge from saved, common and dynamic entries; a `USER` active domain therefore does not imply the current and explicit user lists must be equal. The explicit user list is compared by exact path only; an alternate spelling of the same user-list file is not classified there. A failed read produces only `READ_UNAVAILABLE`. The observation is local to this Mac; no network or customer system is involved.

## Executed one-run protocol; historical record only

1. Completed: independent source/package review, separate one-use controls, offline proof and exact arming-patch review.
2. Refresh the repository, fixture and Keychain read-only baseline immediately before arming. Check all unrelated gates remain off and that the new journal, binary and receipt are absent.
3. Present the reviewed source identity, exact minimal arming diff, one-run scope, result grammar, journal and stop behaviour for fresh action-time owner approval. A previous approval applied only to metadata V1.
4. If approved, apply the exact patch, verify the source-bound arm64 build and signature, run `node scripts/staging-provider-keychain-search-domain-live-launcher.mjs` **once**, disarm immediately, verify the preserved fixture and original settings, and record the categorical result. Unexpected output, timeout, UI prompt or changed identity means HOLD with no retry.

Do not infer that a matching explicit user list permits ignoring other current-domain entries. A later fixture cleanup needs a separate design that preserves the entire observed pre-run search list and verifies restoration without modifying unrelated Keychains.
