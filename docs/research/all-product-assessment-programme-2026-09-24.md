# All-product scientific assessment before launch

The owner has chosen a stronger public-opening condition: complete an evidence-backed assessment for **every current product** before launch. This is research work, separate from a product being safe and commercially eligible to sell. No historical numerical score is approved for display as a recommendation while this programme is unfinished.

## What is actually known

- `lib/methodology.ts` has 15 historical method groups covering 25 catalogue category labels. Some broad labels, especially vitamins and wellbeing, need more specific outcome questions.
- `lib/scores.ts` contains 230 frozen historical lookups, including three aliases. These are **not** the live-product count or proof of effectiveness. The old generator depends on a missing Windows-only source dataset.
- `docs/research/scoring-evidence-inventory.md` records zero approved product-level assessment datasets. `lib/assessment-display.ts` currently prevents every score from becoming a public effectiveness recommendation; keep that guard.
- The current product and variant list is read from Supabase by `lib/product-data.ts`; the repository does not contain a verified current snapshot. Therefore no honest percentage of products assessed can yet be calculated.
- `lib/scoring-foundation.ts` already models labels, formula hashes, source records and separate review roles. It remains unpublished and should be reused rather than replaced solely for a new design.

## Work that enables bounded parallel research

1. Export a fresh, read-only list of current product and variant IDs, category, brand, flavour, pack and public status. Reconcile its count and source date. Never derive the checklist from the 230 historical scores.
2. Create a versioned formula/source register. Each exact variant needs a manufacturer label or specification, retrieval date, content hash, ingredients, forms, amounts per serving, directions, allergens, warnings and formula revision. Missing evidence remains marked missing.
3. Pilot **creatine** end to end: exact label, narrow performance-related research question, dose/context/effect/safety evidence, independent review and public wording. This tests the process without assuming every creatine product works or using brand reputation as evidence.
4. Divide the reconciled register into non-overlapping category/product batches for research sub-agents. Each worker must return source-linked extraction, explicit unknowns and a proposed conclusion only; it cannot approve or publish its own work. A separate reviewer checks label transcription and scientific interpretation. Research outcomes and commercial price are kept separate.
5. Reject unsupported precision. Start with an explainable assessment category and context; a numerical score is optional only if the method and calibration support it. A changed label or formula invalidates the previous assessment.
6. Publish only from a single approved record to comparison pages, product pages, stacks, search metadata and the shop. Verify that no old value leaks into rankings or recommendations.

**Launch proof:** the current reconciled product register has no missing or expired assessment for any product in public launch scope; each approval binds exact variant/formula, sources, method, reviewer and date; independent sampling catches no label or claim mismatch; public UI/API/metadata show the same result. Any product lacking this evidence must remain unassessed and outside the owner's chosen public-opening scope until resolved. The sub-agent audit that scoped this programme was read-only and performed no product approvals.
