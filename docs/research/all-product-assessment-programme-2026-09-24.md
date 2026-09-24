# All-product scientific assessment before launch

The owner has chosen a stronger public-opening condition: complete an evidence-backed assessment for **every current product** before launch. This is research work, separate from a product being safe and commercially eligible to sell. No historical numerical score is approved for display as a recommendation while this programme is unfinished.

## What is actually known

- `lib/methodology.ts` has 15 historical method groups covering 25 catalogue category labels. Some broad labels, especially vitamins and wellbeing, need more specific outcome questions.
- `lib/scores.ts` contains 230 frozen historical lookups, including three aliases. These are **not** the live-product count or proof of effectiveness. The old generator depends on a missing Windows-only source dataset.
- `docs/research/scoring-evidence-inventory.md` records zero approved product-level assessment datasets. `lib/assessment-display.ts` currently prevents every score from becoming a public effectiveness recommendation; keep that guard.
- The current comparison product list is read from Supabase by `lib/product-data.ts`. On 25 September, the signed-in production Supabase table editor displayed **229 records** in `public.products`. A read-only SQL export produced the dated [229-row product identity snapshot](data/supabase-products-2026-09-25.csv), reconciled against the live table count and 25 category totals. It has unique product IDs, names, brands, categories and serving fields. It does **not** establish an exact formula, label revision, flavour/pack variant, Shopify sellable-variant count or approved assessment. No honest percentage of products scientifically assessed can yet be calculated.
- `lib/scoring-foundation.ts` already models labels, formula hashes, source records and separate review roles. It remains unpublished and should be reused rather than replaced solely for a new design.

## Work that enables bounded parallel research

1. Start from the dated 229-row Supabase identity snapshot; export/reconcile the missing current formula, flavour, pack, public-status and Shopify sellable-variant fields. Refresh the snapshot if production products change. Never derive the checklist from the 230 historical scores.
2. Create a versioned formula/source register. Each exact variant needs a manufacturer label or specification, retrieval date, content hash, ingredients, forms, amounts per serving, directions, allergens, warnings and formula revision. Missing evidence remains marked missing.
3. Pilot **creatine** end to end: exact label, narrow performance-related research question, dose/context/effect/safety evidence, independent review and public wording. This tests the process without assuming every creatine product works or using brand reputation as evidence.
4. Divide the reconciled register into non-overlapping category/product batches for research sub-agents. Each worker must return source-linked extraction, explicit unknowns and a proposed conclusion only; it cannot approve or publish its own work. A separate reviewer checks label transcription and scientific interpretation. Research outcomes and commercial price are kept separate.
5. Reject unsupported precision. Start with an explainable assessment category and context; a numerical score is optional only if the method and calibration support it. A changed label or formula invalidates the previous assessment.
6. Publish only from a single approved record to comparison pages, product pages, stacks, search metadata and the shop. Verify that no old value leaks into rankings or recommendations.

**Launch proof:** the current reconciled product register has no missing or expired assessment for any product in public launch scope; each approval binds exact variant/formula, sources, method, reviewer and date; independent sampling catches no label or claim mismatch; public UI/API/metadata show the same result. Any product lacking this evidence must remain unassessed and outside the owner's chosen public-opening scope until resolved. The sub-agent audit that scoped this programme was read-only and performed no product approvals.
