# Stage 3 fixture metadata: unapplied arming preview

Base disabled source commit: `aa1834f0d22a1a6fb185bfa4bbc5610cbb75a4ce`.

This is a review specification, **not permission to apply it**. Only the following four line changes are proposed:

| File | Existing value | Proposed value |
| --- | --- | --- |
| `scripts/staging-provider-keychain-fixture-metadata-diagnostic.swift` | `tllMetadataDiagnosticEnabled = false` | `tllMetadataDiagnosticEnabled = true` |
| `scripts/staging-provider-keychain-fixture-metadata-live-launcher.mjs` | `TLL_FIXTURE_METADATA_LIVE_ENABLED = false` | `TLL_FIXTURE_METADATA_LIVE_ENABLED = true` |
| `config/staging-account-activation-manifest.json` Swift source pin | `0f76d1e8eb81c606cbd014e4b6e18c4d68ef2e7d40ca4c0d850e1d10d2637392` | `c496af448c15b2165716b061c528ad0e713efd26f2f84c9e5f781d33ee7046e7` |
| `config/staging-account-activation-manifest.json` launcher source pin | `ede834ef60fac30559ca053b2826d8cac1c9df74456f212a0a8ea1de4e1ac9ec` | `8ae76458ea4bd3187fa4b40baa34a6b7a409c1fb6f22370f2d6c1ed058b49e55` |

An exact 42-line unified patch generated from that base was checked with `git apply --check` and had SHA-256 `b9b004fafe49444fc37569d7204964a2456785559a0566d55ca2f57f00b083d1`. Its local temporary copy is `/tmp/tll-stage3-metadata-arming-preview-aa1834f.patch`; that path is not a durable project artifact. Regenerate and recheck the patch from the four lines above if it is missing or the source base changes. The review must also inspect the disabled runner, build/check, journal and coordinator; a small arming diff alone does not prove the run is safe.
