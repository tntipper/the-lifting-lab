# Stage 3 fixture metadata: revised unapplied arming preview

Corrected disabled source commit: `ffd509afe646c6298625332ca33e1c15975ef508`.

This is the proposed **review package**, not permission to apply or run it. The only proposed source changes are:

| File | Existing value | Proposed value |
| --- | --- | --- |
| `scripts/staging-provider-keychain-fixture-metadata-diagnostic.swift` | `tllMetadataDiagnosticEnabled = false` | `tllMetadataDiagnosticEnabled = true` |
| `scripts/staging-provider-keychain-fixture-metadata-live-launcher.mjs` | `TLL_FIXTURE_METADATA_LIVE_ENABLED = false` | `TLL_FIXTURE_METADATA_LIVE_ENABLED = true` |
| `config/staging-account-activation-manifest.json` Swift source pin | `0f76d1e8eb81c606cbd014e4b6e18c4d68ef2e7d40ca4c0d850e1d10d2637392` | `c496af448c15b2165716b061c528ad0e713efd26f2f84c9e5f781d33ee7046e7` |
| `config/staging-account-activation-manifest.json` launcher source pin | `3069dea0e2284e160ac7e8a841ad458bd9cfbab1b560f1632d59a49143bb92a4` | `d62df689ad206491538c902f71e1688b6a702f18411af951bdf9404ce325634c` |

The resulting 42-line patch is stored temporarily at `/tmp/tll-stage3-metadata-arming-preview-ffd509a.patch`, SHA-256 `39aa4389087247e627ca40435817c11d9e96278bd08e81a5024be8165fa50d38`. `git apply --check` passed against the corrected disabled commit. The temporary patch is not a durable project artifact; regenerate from this record if missing or if source drifts. Independently review the corrected builder, launcher, journal and native diagnostic as well as these four changes. Do not use the superseded `aa1834f` preview.
