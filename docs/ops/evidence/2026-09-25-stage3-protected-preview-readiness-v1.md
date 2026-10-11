# Protected staging Preview readiness — one run

Date: 2026-09-25. Disabled source: `8106630a0460b1c60ea6be0d207ec9db1d0cc1e6`. Separate local arming checkout: `../implementation-preview-readiness-arm-v1`. No production deployment or provider change was made.

The owner approved one protected Preview read after independent review of the exact three-file arming diff. The live launcher returned `PREVIEW_DISABLED_VERIFIED` for deployment `dpl_9CFPQG6JChoGrkWidhh73BY1Qj1b` and staging Supabase project `qdmvngjwkcsilzmqksme`. Its contract accepted only three ordered GETs (alias, immutable deployment, alias) and an exact eight-field JSON response with all private/public customer/cart switches `false`.

The private journal `../implementation-state/staging/tll-preview-readiness-v1.json` is terminal `OBSERVED`, phase `SOURCE_READ`, sequence 3. It is consumed; never replay this window. Immediately afterward, the arming checkout restored the launcher, shared Keychain helper and generated manifest to disabled source. Manifest check and live-boundary check passed, direct launcher returned `PREVIEW_READINESS_LIVE_DISABLED`, and its tracked working tree was clean. The retained bypass was not removed; no token bytes were logged.

This confirms the protected Preview state at the time of the check. It does not prove the staging provider has changed or authorise changing it. The next gate is a separately reviewed Supabase-only two-field provider update with a fresh owner approval and a new journal.
