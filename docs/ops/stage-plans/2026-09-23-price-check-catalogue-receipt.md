# Price-check catalogue receipt — offline unit

## Outcome

Add a pure completeness gate for a supplied, paginated Shopify variant snapshot. A shadow price-check run may use the supplied variants only when all page links, IDs, scope, count and snapshot bindings agree. A PASS means the supplied evidence is internally complete; it does not authenticate a Shopify response or prove that Shopify's declared count is correct. Keep all automation, Shopify writes and pricing authority disabled.

## Starting state and limits

Start from `codex/tll-integration` at `72ed80d`, with both hosted native flags false and unrelated untracked files preserved. The existing `competitor-price-check.ts` evaluates supplied rows but cannot establish catalogue coverage. No approved competitor feed, Shopify full-catalogue reader, independent count source, match registry, or margin authority exists. Stage 3 remains HOLD. No purchase, production change, customer message, supplier order, hosted credential, network call, scraper or scheduler is authorized in this unit.

## Permitted changes and checks

Only add a pure `lib/commerce/price-check-catalogue-receipt.ts`, focused synthetic tests, this plan, `docs/ops/daily-price-checks.md`, generated activation-manifest pins, and `.agent/HANDOVER.md`. Before changes verify branch, HEAD, status and disabled gates. The receipt requires one immutable shop/scope/snapshot binding, a finite bounded page sequence, continuous cursors, one terminal page, unique opaque variant IDs, exact equality with supplied variant IDs, and equality with a separate declared count for that scope. Any missing, malformed, duplicate or out-of-order evidence returns HOLD with fixed reason codes and no partial PASS. Empty catalogue is HOLD pending an explicit separate decision. A count is only caller-supplied evidence; do not label it authenticated.

## Failure, review and closure

Synthetic tests cover missing/extra IDs, duplicate IDs and cursors, skipped or reordered pages, inconsistent count/scope/snapshot, missing terminal page, empty pages/catalogue, sparse/malformed arrays and valid multi-page cases. Do not call the existing planner from this gate or present PASS as a live-commerce approval. Run focused tests, full disabled suite, typecheck, lint, both manifest checks and `check:live-boundaries`. Obtain independent read-only review of catalogue identity/completeness assumptions and correct evidence-backed findings. One offline implementation attempt; stop if the work needs live API access or a different trust assumption. Commit and update handover only after passing checks. The later real reader must authenticate Shopify responses, verify permission/filter scope and independently establish expected count before a complete-catalogue shadow run.

## Review finding and closure

Independent review found a false PASS when a terminal page reused a non-adjacent earlier end cursor. The gate now tracks all end cursors, with that exact three-page sequence retained as a regression. Sparse and bounded-input cases are also retained. The reviewer returned GO for this corrected offline contract only; authentic Shopify origin, stable pagination and price-row binding remain outside this unit.
