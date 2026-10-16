# Stage 3 Preview setting-name observation — 26 September 2026

The owner approved one v2 read-only Vercel observation after an independent review. It ran once from main integration commit `7f05a9ad32c21a4f6fa9516811abf260226b3f0d`. Its private journal `../implementation-state/staging/tll-preview-environment-inventory-v2.json` is `FINISHED/HOLD`, mode `0600`, with a result digest. The local Keychain preflight had already returned `FINISHED/READABLE`; v1's terminal `READ_UNAVAILABLE` journal was preserved. No record was replayed.

The observer checked project `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4` and its pinned GitHub repository before reading the effective `codex/tll-integration` Preview setting names. It returned 17 of 37 required names and the following 20 missing names:

- Public Preview switches: `NEXT_PUBLIC_TLL_STAGING_CART`, `NEXT_PUBLIC_TLL_STAGING_CUSTOMER`.
- Server switches: `TLL_STAGING_CART_ENABLED`, `TLL_STAGING_CUSTOMER_ENABLED`.
- Restricted database passwords: `TLL_STAGING_BRIDGE_DATABASE_PASSWORD`, `TLL_STAGING_BROKER_DATABASE_PASSWORD`, `TLL_STAGING_CART_DATABASE_PASSWORD`, `TLL_STAGING_CUSTOMER_DATABASE_PASSWORD`, `TLL_STAGING_PROVISIONAL_DATABASE_PASSWORD`.
- Cart secrets: `TLL_STAGING_CART_HMAC_KEY_HEX`, `TLL_STAGING_CART_VAULT_KEY_HEX`, `TLL_STAGING_CART_VAULT_KEY_ID`.
- Customer secrets: `TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_HEX`, `TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID`, `TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_HEX`, `TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_ID`, `TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX`, `TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_ID`, `TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_HEX`, `TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_ID`.

The existing `TLL_STAGING_CART_STOREFRONT_TOKEN` name has unproven secret classification. The observation did not return or verify values. `HOLD` therefore remains correct. This does not prove whether account/cart will work after settings are added; compiled and runtime flags still need a protected Preview check.

Immediately after the single run, both local access switches were restored to false and the activation manifest regenerated. Activation-manifest, hosted-baseline-manifest and live-boundary checks passed. No Vercel setting, deployment, Supabase control, account/cart activation, customer data, Production state or purchase changed in this window.

Next: prepare and review the minimum staging-only credential/configuration package for the missing names. Keep both enablement switches off until credentials and the complete account/cart journey are proven. Verify the storefront token's type without exposing its value. Any hosted setting write and later enabled Preview deployment need separate action-time approval and recovery controls.
