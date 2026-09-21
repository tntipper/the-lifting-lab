# Stage 3 Slice 5 — cart account bind + guest→account acceptance

Date: 2026-09-21  
Base: `codex/tll-integration` @ `7f670cbc1b7ba8fb4a0a95caf1be93e0d8c44d76`  
Plan: `docs/ops/stage-plans/2026-09-21-stage-3-slice-5-cart-account-bind.md`  
Tip under test: `0269c70352cd044c566dd24e69cc984ddbc624e1`

## Investigation (library vs mount)

| Existing proof | What it covers | What it does not cover |
|----------------|----------------|------------------------|
| `tests/staging-cart.test.mjs` handler fixture (`createCartHandler`) | Guest/account transition semantics, transfer, use_account, lost finish, CSRF, stale revision, unavailable variant, uncertain mutation without resend | Does not invoke `stagingCartRoute` / `app/api/cart/route.ts` with a verified Supabase UUID |
| Tip mount test “actual enabled Next route…” | Guest open/PATCH through App Router exports; env/origin/project gates; secret-free body | `createServerSupabase` stub returned `user: null` only — **account bind unproven through mount** |
| `tests/staging-cart-transition.test.mjs` | AAD rewrap, conflict/held, empty transfer | Unmounted service |
| `tests/staging-cart-account/acceptance.test.mjs` | Real PG17 migration 014 one-use claim/finish, concurrent claims, stale revision, expired hold | Requires disposable `tll_cart_account_v2`; not App Router; not run in this slice (fixture setup not invoked) |
| `tests/browser/staging-cart.mjs` | React UI: refresh without mutation replay, held edits, explicit Connect guest cart, account-switch discard | Fake local API; not Next route / real Supabase |
| `lib/commerce/staging-cart-server.ts` | Composition: gates, vault, postgres purpose `cart`, `currentActor` from `getUser()` | No mount proof that verified UUID reaches account session |

**Verdict:** Library/handler/SQL/browser coverage for Slice 5 semantics existed at tip `7f670cb`. Slice 5 closes **App Router mount proof** that `stagingCartRoute` binds the verified canonical account UUID into the cart actor and keeps guest→account **explicit**.

## Approach taken

- Extend `modules()` Supabase stub with injectable `getUser` (verified UUID or null).
- `mountedCart()` harness: same env/origin/project/CA/HMAC gates as production composition; routes `tll_cart_*` and `tll_cart_transition_*` RPCs into the in-memory fixture repositories.
- Primary proofs load `app/api/cart/route.ts` and call exported GET/POST/PATCH.

## PASS / GAP

| Item | Result | Evidence |
|------|--------|----------|
| Mounted account-bound cart actor (no guest cookie) | **PASS** | `tests/staging-cart.test.mjs` — mounted route binds cart actor… |
| Distinct verified accounts do not share cart by cookie | **PASS** | same — second actor GET → empty |
| Mounted guest cookie + signed-in → `transition_required` (no silent ready account cart) | **PASS** | mounted route never silently reinterprets… |
| Mounted `transfer` clears capability only after acknowledgement | **PASS** | mounted transfer moves guest custody… |
| Mounted `use_account` refuses silent merge | **PASS** | mounted use_account refuses silent merge… |
| Refresh without automatic mutation resend | **PASS** | browser fixture Refresh cart; handler uncertain-mutation tests |
| Duplicate / same-request replay without second Storefront write | **PASS** | `same request retry and concurrent clients cannot duplicate a mutation…` |
| Stale revision → conflict, change not applied | **PASS** | `stale revision explicitly reports…` (+ SQL acceptance when DB available) |
| Unavailable / bad provider variant → held, no ready success | **PASS** | `provider unavailable` / `wrongVariant` / related fault matrix |
| Uncertain provider mutation without automatic resend | **PASS** | uncertain create/known-cart mutation + lost reservation COMMIT tests; browser lost→refresh |
| Browser history “back” navigation | **GAP** | No dedicated `history.back` case; closest: account-switch / unmount discard of late responses in `tests/browser/staging-cart.mjs` |
| Hosted preview `/api/cart` with real Supabase session + migration 014 | **GAP** | Offline fixture only; hosted cart enablement excluded |
| Durable SQL transition through App Router mounts | **GAP** | Mount uses injected pool; PG suite remains `tests/staging-cart-account/acceptance.test.mjs` |
| Slice 6 logout/orders / hosted stop-before-purchase | **GAP** | Explicitly excluded |
| Storefront buyer access token in client responses | **PASS (absent)** | buyerIdentity countryCode only; mount body secret checks; no access token fields |
| `npm run check:live-boundaries` | **PASS** | `{"status":"PASS","violations":0}` |

## Commands run

```bash
npm run check:live-boundaries
node --test tests/staging-cart.test.mjs
node --test tests/staging-cart-transition.test.mjs
```

Did **not** run `tests/staging-cart-account/setup.mjs` (avoids destructive fixture reset).

## Hard exclusions observed

No Gen 20, no live/run-live-once/keychain arming, no production Supabase `wrhgscovsgsudtedbljr`, no customer email as identity, no purchases, no production deploy, no Slice 6 scope expansion.
