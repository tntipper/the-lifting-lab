# Stage 3 minimum Supabase staging baseline — 26 September 2026

At 09:50 UTC, the owner-approved, independently reviewed read-only baseline ran once from disabled source commit `7366a993b9cd7e077966f16a1e590eeb567d0395`. The separate local Keychain preflight first returned `READABLE`, then was switched off. Its one-use record is terminal `FINISHED/READABLE`.

The hosted observer's exact three-file temporary arming diff changed only its two access switches and their two activation-manifest SHA pins. An independent reviewer gave GO for that diff; both generated manifest checks passed before the run. The staging result was:

```json
{"status":"DISABLED_BASELINE_OBSERVED","assessment":{"status":"DISABLED_BASELINE_OBSERVED","projectRef":"qdmvngjwkcsilzmqksme","missingEdgeNames":[],"brokerDatabasePasswordAlreadyPresent":false}}
```

The strict read-only SQL receipt confirms the 15 expected staging migrations, five restricted runtime roles without login/password, five disabled database controls, no runtime sessions and no execution privilege edges. Edge secret **names** include the existing broker client secret, Edge-enable name and two certificate names; the broker database password name is absent. The official provider GET matched the disabled post-rotation provider, including its retained pinned JWKS address. This does not establish the Edge-enable secret's value or equality of any write-only secret values.

The private `../implementation-state/staging/tll-minimum-configuration-supabase-v1.json` journal is terminal `FINISHED/DISABLED_BASELINE_OBSERVED`, mode `0600`, and contains a result digest. It must never be replayed or removed. The exact arming patch was reversed immediately after the single read. A disabled invocation returned `STAGING_MINIMUM_CONFIGURATION_LIVE_DISABLED`; both generated manifest checks, live-boundary check and tracked-clean check passed. The six pre-existing untracked paths remain untouched.

No setting, provider, database control, deployment, customer account/cart, Production state, purchase or customer message was changed. Next: prepare the new disabled 16-credential staging package and four disabled switches against this observed baseline. Recheck the hosted target immediately before any later write, independently review that successor and seek a separate action-time approval. Do not rerun this baseline or historical Generation 6–21 windows.
