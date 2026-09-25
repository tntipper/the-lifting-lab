# Stage 3 preserved-fixture metadata: one read-only diagnostic gate

Status: **PLAN ONLY / DISABLED**. This is a successor to the disabled source plan, not an authorization or an executable instruction to run now.

**Disabled preparation checkpoint:** The fixed-target build/check, one-use journal, injected coordinator and disabled launcher are present. The Swift and launcher gates are both false. The new journal, armed binary and build receipt are absent. The activation manifest pins these sources and the live-boundary checker rejects either gate being true during ordinary tests. Twelve metadata-focused tests, the 20-test manifest/metadata group, TypeScript, lint, live-boundary and the full suite (2,506 pass, 2 skip) passed after correcting the manifest test's expected source list. No live binary was built and no real fixture or Keychain metadata was read by this preparation. Independent review, fresh action-time baseline and approval remain outstanding.

## Question and expected evidence

The V1 cleanup journal ended `API_DELETE/UNCERTAIN/CHILD` and did not identify the native failure. The fixture main file, zero-byte sidecar, parent directory, default login Keychain and sole user search-list entry were preserved. A read-only diagnostic can distinguish an unexpected native Keychain path representation from changed fixture identity. A `METADATA_MATCHED` result would reject those two hypotheses only; it would **not** prove what happened in `SecKeychainOpen`, `SecKeychainDelete`, post-delete verification or restoration. The old journal remains terminal and must not be replayed.

## Fixed scope

- One local Mac run only, against the pinned synthetic fixture. No Shopify, Supabase, Vercel, network, customer, order, purchase or production action.
- Native calls limited to `SecKeychainCopyDefault`, `SecKeychainCopySearchList`, `SecKeychainGetPath` and read-only file metadata. Do not open a Keychain, read an item or file contents, change permissions, remove a file, or call `SecKeychainDelete`.
- Report only one fixed result category. Never print paths, secrets, credentials, raw Security.framework errors or raw child output.
- Use a **new**, exclusive, mode-0600 one-use journal under the existing owner-only `../implementation-state/staging` directory. Preserve it after any result. Do not use any V1 create/recovery journal.
- The diagnostic Swift gate and its exact launcher gate stay false during ordinary tests. The run requires a reviewed minimal arming diff, a source-bound arm64 build to a new private filename, binary/source hashes, ad-hoc signing identity, and a fixed deadline. The source and launcher are disarmed immediately after the single attempt, regardless of outcome.

## Preparation and proof before asking for run approval

1. Implement the disabled, fixed-target build/check, one-use journal, coordinator and launcher. Add injected tests for mismatched source/binary, unexpected output, timeout, missing fixture, consumed journal, changed directory or child identity, disabled switches and no child dispatch on failed preflight. Ordinary tests must not call the live main. Add the new gates to the live-boundary checker and pin the new sources in the activation manifest.
2. Run focused native offline cases, TypeScript, live-boundary and the full local suite while all gates are false. Inspect the exact proposed two-gate arming patch; review the source and diff independently before any run.
3. Obtain a fresh read-only local baseline immediately before arming: checkout/branch/HEAD/status; fixture directory, main and sidecar identities (metadata only); default and sole search-list Keychain path; owner-only journal directory; absence of the new journal and binary; current source and manifest hashes; all unrelated live gates false. A mismatch means STOP and revise the plan, not an automatic fix.
4. Present the exact source commit, diff, build identity, one-run command, read scope and stop/recovery behavior to the owner for **fresh action-time approval**. Prior cleanup approvals do not cover this diagnostic.

## One run and interpretation

Create the new journal before dispatch. Recheck source/build and fixture identity. Run one bounded native child with ignored stdin, a minimal environment and a fixed output limit; record dispatch intent before the call. Accept only the enumerated category and exact output grammar. Record a durable terminal result, then disarm and verify source/manifest boundaries. An interrupted or ambiguous child is `UNCERTAIN`, never replayed.

If a path or fixture identity mismatch is reported, investigate the exact mismatch **read-only** and revise the cleanup design. If `METADATA_MATCHED`, keep Stage 3 HOLD and design a separate observable test for the remaining native failure points; do not try deletion again merely because the metadata matched. A missing journal terminal, unexpected UI, timeout, unreadable state or changed file identity remains HOLD/UNCERTAIN with the fixture preserved. No result from this diagnostic authorizes provider normalization or account/cart activation by itself.
