# T05 local mapping review

`mapping-review.csv` is a **private review proposal**, not an approved import or a public product feed. It contains supplier costs. Keep it out of `public/`, site responses and customer logs. Every row has `active=false`, `price_auto=false` and a blank `approval_reference`. No database, live service or website reads this file.

Run from the repository root:

```sh
node --experimental-strip-types scripts/seed-mapping.mjs
npm run mapping:check -- --input data/mapping-review.csv
node --experimental-strip-types --test tests/seed-mapping.test.mjs tests/product-mapping.test.mjs tests/catalogue-eligibility.test.mjs
npm run check:live-boundaries
```

The script reads only local files. It never fetches missing sources. XLSX reading requires existing `python3` and `openpyxl`; no dependencies are installed. Alternatively pass CSV worksheet exports using `--catalogue` and `--supplier`. Keep the original worksheet headers and export IDs/EANs as text (leading zeroes matter). `--help` lists all input/output switches. Source files are never changed, and malformed or missing inputs leave an existing review file untouched.

## Exact sources used

| Input | Local file | Meaning |
| --- | --- | --- |
| Catalogue | `outputs/01a0eec0-23d2-75a3-8826-52bfed59e4ab/TLL_product_catalogue_2026-10-02.xlsx`, `Catalogue` sheet | 2 Oct product IDs, SKU, title, options, status; 14 Sep historical cost |
| Supplier comparison | `outputs/feed-review-2026-10-02/TLL_supplier_feed_comparison_2026-10-02.xlsx`, `Comparison` sheet | Saved 2 Oct quotes, EAN, pack and review notes |
| Shopify IDs | `docs/ops/evidence/2026-09-30-shopify-variant-readback.csv` | Variant IDs, handles and historical publication observations; joined by product ID + exact SKU |
| Comparison products | `docs/research/data/supabase-products-2026-09-25.csv` | Saved comparison product IDs, names and brands |
| Historical links | `docs/research/data/comparison-shopify-supplier-reconciliation-2026-09-25.csv` | Unverified historical Shopify/SKU links to comparison products |

Both workbooks exist locally but `outputs/` is ignored by Git. A fresh checkout needs those **two exact workbooks**, or CSV exports of those sheets; the three other sources are tracked. The script reports the exact missing path and supports fixture-only operation if real files are unavailable. This run needed no additional source files.

## How proposals are made

There is one store proposal per catalogue variant, including draft placeholders, plus affiliate proposals for comparison products without a proposed launch link. An ambiguous comparison candidate is retained for manual choice and is not also declared unmatched affiliate. These statuses describe proposals, not permission to sell.

Saved variant-ID/SKU matches come first. Product-ID links are used only if no specific link exists. Without a historical link, an exact brand-plus-name comparison after case/punctuation normalisation can propose a product family. `match_confidence` distinguishes `historical_variant_sku`, `historical_product`, `name_only`, `ambiguous` and `unmatched`; none proves exact pack/flavour identity. No fuzzy matching or invented comparison IDs are used. Conflicting candidates leave the product ID blank.

Exact SKU joins supply EAN and the saved quote; repeated equivalent quote/EAN/pack/name observations collapse, while conflicting observations withhold cost and EAN. A missing 2 Oct quote may retain a clearly labelled 14 Sep historical cost. The 5 Oct supplier-terms evidence confirms feed trade prices exclude VAT: `docs/ops/evidence/2026-10-05-supplier-terms-scope-and-baseline.md`. `cost_ex_vat` remains a dated proposal, not current commercial approval. Missing values stay blank. Internal TLL placeholder SKUs are retained in `shopify_sku_observed`, with the actual supplier SKU blank.

`publication_observed_2026_09_30` preserves historical published values. The T04 checker's `published` field is intentionally absent: this file neither asserts current publication nor changes it. The checker reports publication unchecked. A live approval/import review must separately reconcile current publication, especially because proposed rows are inactive.

## Review still required

The generated file has 243 rows: 74 store proposals and 169 affiliate proposals. The full file intentionally fails `mapping:check` with 31 issues across 14 rows, recorded in `validation_issues`; the validator is unchanged. Sixty store proposals have complete required fields. That is structural validation only. The 13 draft placeholders lack actual supplier SKU/cost (13 missing-SKU and 13 missing-cost issues). Five variants need comparison-ID choices (five missing-product issues): STM008 has two conflicting historical IDs; the SiS Go Hydro, Strom Hydramax, The Protein Works Whey 80 and Bulk ZMA placeholders have no exact saved/name match. Their local comparison catalogue contains possible families, but abbreviated or different names are not silently equated. T05's zero-error acceptance and 20-row human sign-off are still outstanding.

Toby/Lifty must resolve those choices, confirm actual supplier offers for placeholders or exclude them, and sign a 20-row sample covering name-only matches, flavour variants, duplicates and missing-feed cases. Exact UK label/pack/flavour and fresh cost/stock review remains necessary. REF152 has historical cost only. The 5 Oct exclusions OPT034, PER183, SYN031 and OPT296 remain held; 2 Oct ACTIVE observations do not supersede that decision. Approvals must be recorded later in a separately authorised operation. No credentials or hosted database access are needed for this ticket's offline work.
