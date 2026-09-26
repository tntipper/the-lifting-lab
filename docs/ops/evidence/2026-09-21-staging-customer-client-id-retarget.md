# Staging Customer Account Client ID retarget — 2026-09-21

## Verdict

**PASS (code):** Staging Customer Account public Client ID retargeted to the Headless Customer Account Confidential Client `c8f7b926-9073-416c-9949-0d99e89a99c0`. Shop, issuer, reviewed preview origin, callback path, and OAuth scopes unchanged. Feature flags remain off.

**GAP (operator):** Vercel Shopify client secret for this Headless client, proof stamp / config hash re-approval, and hosted Stage 3 walk remain Toby operator steps. Not done in this change. Do not write Vercel env from an agent.

## Why

Shopify authorize returned 400 invalid scope for client `63f474eda69ec32778ce2a99e8c1114f` with scope `openid email customer-account-api:full`. That value is the Dev Dashboard app key, not the Customer Account OAuth client. Toby confirmed (screenshot, 21 Sep 2026) the shop Headless Customer Account Confidential Client ID is `c8f7b926-9073-416c-9949-0d99e89a99c0`.

## Scope decision

Keep OAuth authorize/token scopes `openid email customer-account-api:full` exactly. Shopify Customer Account OAuth docs still require that triad. Dev Dashboard `customer_read_customers` / `customer_read_orders` are app access scopes (shopify.app.toml / installed permissions), not substitutes for the OAuth scope string. Token adapters fail closed on exact set equality with `CUSTOMER_SCOPES`. Authorize query shape is unchanged.

## Unchanged

- Shop id `107532616020`
- Issuer `https://shopify.com/authentication/107532616020`
- Reviewed preview origin `https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app`
- Callback path `/auth/customer/shopify/callback`
- `CUSTOMER_SCOPES` = `openid`, `email`, `customer-account-api:full`
- Staging customer/cart feature flags not enabled
- Production untouched; no secrets committed

## Source of truth

`STAGING_CUSTOMER_CLIENT_ID` in `lib/identity/customer-connection.ts` === `c8f7b926-9073-416c-9949-0d99e89a99c0`
