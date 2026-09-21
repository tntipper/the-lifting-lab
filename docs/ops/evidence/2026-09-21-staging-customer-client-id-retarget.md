# Staging Customer Account Client ID retarget — 2026-09-21

## Verdict

**PASS (code):** Staging Customer Account public Client ID retargeted to live Optimus TLL app `63f474eda69ec32778ce2a99e8c1114f`. Shop, issuer, reviewed preview origin, and callback path unchanged. Feature flags remain off.

**GAP (operator):** Vercel env secret for the new app, proof stamp / config hash re-approval, and hosted Stage 3 walk remain owner steps. Not done in this change.

## Why

Toby confirmed (21 Sep 2026) the only Shopify app in Dev Dashboard is Optimus TLL. The previously pinned Client ID `c8f7b926-9073-416c-9949-0d99e89a99c0` was obsolete and must not remain in code.

## Scope decision

Keep OAuth authorize/token scopes `openid email customer-account-api:full`. Shopify Customer Account OAuth docs still require that triad. Dev Dashboard `customer_read_customers` / `customer_read_orders` are app access scopes (shopify.app.toml / installed permissions), not substitutes for the OAuth scope string. Token adapters fail closed on exact set equality with `CUSTOMER_SCOPES`.

## Unchanged

- Shop id `107532616020`
- Issuer `https://shopify.com/authentication/107532616020`
- Reviewed preview origin and callback path
- Staging customer/cart feature flags not enabled
- Production untouched; no secrets committed

## Source of truth

`STAGING_CUSTOMER_CLIENT_ID` in `lib/identity/customer-connection.ts` === `63f474eda69ec32778ce2a99e8c1114f`
