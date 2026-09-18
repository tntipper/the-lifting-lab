# Staging guest-to-account cart transition

Migration `202609180014_staging_cart_account_transition.sql` and `lib/commerce/staging-cart-transition.ts` provide the durable local custody move required before a guest cart can become the canonical signed-in cart. They add no route, browser control, Storefront request, checkout, hosted credential or activation.

The transition is explicit and one-use. It binds the source session and guest actor hashes, target account session and actor hashes, request UUID and exact source revision. Claim locks source and target in a fixed order, requires the cart repository to be enabled, rejects an existing target cart, and gives the source a 45-second lease. A competing request, changed revision or different target cannot merge or replace either cart.

The application opens the encrypted Shopify cart ID only under the original guest session/actor AAD and immediately seals it under the target account session/actor AAD. No Shopify request or cart mutation occurs. Finish verifies the unchanged quantity/price projection, inserts the account record, clears the encrypted source custody and leaves a held source tombstone. The transition receipt preserves whether custody is `claimed`, `reconciled` or `held`.

A lost claim acknowledgement is never retried automatically with a new operation. Inspection eventually converts an expired claim to held. A lost finish acknowledgement can be recovered by reading the exact durable transition: a reconciled target is authoritative, while any other state releases no account cart. An existing account cart always conflicts; later UI must ask the customer which cart to use and must not combine quantities silently.

The three transition RPCs are executable only by the cart gateway. The gateway, browser roles and platform roles have no direct transition-table access. Migration 014 requires the exact reviewed migration 006 function bodies, the original operator identity and disabled control, and leaves the repository disabled.

Local evidence uses the marked PostgreSQL 17 database `tll_cart_account_v2`. Six actual-database cases cover disabled installation and authority, one-use transfer, replay, existing-target/revision conflict, expired holds, real concurrent claims and disabled entrypoints. Four adapter/service tests cover committed RPC acknowledgement, destroyed uncertain connections, exact AAD rewrap, conflict/held handling and empty carts. The earlier `tll_cart_account_v1` fixture is preserved as failed-install evidence from before the temporary public-schema owner grant was added; it contains migration 006 only and is not authoritative.

The next unit must derive a deterministic account session from the server HMAC and verified Supabase UUID, expose an explicit browser decision, clear the guest capability only after acknowledged reconciliation, and recover a lost response by inspecting the exact transition. Hosted staging still has migrations 002–011 only.
