# Stage 3 Slice 2 — staging customer composition acceptance

Date: 2026-09-21  
Plan: `docs/ops/stage-plans/2026-09-21-stage-3-slice-1-2.md`  
Module: `lib/server/staging-customer.ts`  
Tests: `tests/staging-customer-runtime.test.mjs`

## Acceptance vs tip

| Criterion | Verdict | Proof |
|-----------|---------|--------|
| Composes reviewed staging config; no secrets in source | **PASS** | Runtime reads env only; secrets never committed; factory injectable for offline tests |
| Missing / production / malformed / overlapping config → controlled unavailable | **PASS** | `createStagingCustomerRuntime` returns `null` before pools/vaults; covered by “missing, production…” test |
| Separate custody: token, provisional, cookie, final | **PASS** | `STAGING_CUSTOMER_CUSTODY_SURFACES`; four distinct vault key ids/materials in valid-composition test |
| Least-privilege admission purpose pools (no cart) | **PASS** | `STAGING_CUSTOMER_COMPOSITION_PURPOSES` = customer, broker, provisional, bridge; cart **excluded**; cart remains `lib/commerce/staging-cart-server.ts` |
| Fixed origin / issuer / client / staging project; production rejected | **PASS** | Preview origin gate; connection constants; production project ref in fail-closed cases |
| Synthetic on; live provider paths off | **PASS** | `syntheticExecution: true`, `liveEnabled: false` on delivery/proof/final/account paths |
| No Slice 3 route-journey claim in this PR | **PASS** | Inventory/composition only; existing thin `/auth/customer/` wrappers not expanded |

## Explicitly deferred

- Slice 3+: route mount proof, Shopify callback, cart bind, logout/orders/browser journey  
- Unifying cart purpose into customer composition (intentionally separate)  
- Gen 20 / live re-arm / controls-enabled probe

## Commands

```bash
npm run check:live-boundaries
node --experimental-strip-types --test tests/staging-customer-runtime.test.mjs
```
