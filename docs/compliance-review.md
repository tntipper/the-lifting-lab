# T12 — local compliance draft review (12 October 2026)

**Unsigned. Lifty/Toby review required.** This is the code/document portion of T12, not legal advice or a declaration that the launch acceptance has passed. No live store or database was inspected or changed. Current branch: `codex/t12`, base `cdf9f296` (`codex/tll-integration`); starting HEAD `989d4ab`. Related draft PR lookup could not connect to GitHub; no PR created.

## What the local audit found and changed

| Area | Local gap | Draft now available | Review remaining |
| --- | --- | --- | --- |
| Footer | No delivery/refunds links; contact only in the main footer block | Legal navigation links to refunds, delivery, privacy, terms and contact | Compare actual Shopify theme/footer and policy links separately |
| Refunds | No site page | `/refunds`: cancellation periods, full-order standard delivery refund, timing, qualified seal exception, faulty-goods rights | Returns address, postage allocation, partial-order refunds, exact eligible products and cancellation form |
| Delivery | No site page | `/delivery`: £4.99 per customer order, TLL absorbs supplier dispatch charges, split parcels | Service area, exclusions, estimates; verify actual Shopify checkout settings |
| Privacy | Supabase email mentioned, no Shopify/order/fulfilment explanation | `/privacy`: site data, contact messages, Shopify order data, proposed private order storage and minimum supplier/courier sharing | Retention, lawful basis for enquiries, regions/transfers/agreements, actual recipients and active flows |
| Terms | Comparison-only; duplicate medical paragraph; inconsistent Ltd identity and broad liability wording | `/terms`: proposed seller, Shopify responsibilities, TLL responsibility to customers, linked policy drafts and statutory-rights protection | Toby confirms legal seller/address/phone and order acceptance wording |
| Contact | Form only; no visible direct support contact or shop context | `/contact`: existing email address, order/support/privacy guidance and business details TODO | Confirm monitored email, geographical address, phone and response arrangements |

All five pages clearly show “Draft for Lifty and Toby review”. Delivery/refunds drafts are noindex. Existing privacy analytics/consent controls and contact submission behaviour are retained. Site copy describes the proposed shop policy; it does not prove any live shop configuration or account integration. No supplier costs appear in public delivery copy. The existing pricing policy and commercial-burden modules remain the private calculation source; no duplicate pricing engine was added.

## Product warnings

`lib/commerce/product-warnings.ts` is a pure helper reused by `components/ProductWarnings.tsx` in the real product detail page, before the label and purchase link. No product names/IDs are hard-coded in the page, and warnings remain visible when claims are under review.

- Any positive finite caffeine nutrient amount (including caffeine anhydrous), or explicit public `safety.containsCaffeine=true`, triggers the caffeine notice and proposed 16+ guidance. A false metadata value cannot override recorded caffeine.
- Category data sets a proposed minimum age of 16 for pre-workout products, including stimulant-free entries. A stricter public label `minimumAge` wins; the guidance is explicitly not a legal purchase age.
- Optional `safety.labelWarnings` renders as escaped text. This is a public projection type, not a new database column. **TODO(Lifty): exact UK label review and approved population of this projection.** No migration or live data loading was added.
- Missing/zero/invalid caffeine data is not interpreted as proof that a product is caffeine-free. The component reminds customers to check the current pack. Other caffeine sources must be considered. Amounts are not claimed as verified daily portions.

Lifty/Toby must approve the category/16+ guidance, confirm any 18+ restrictions, check exact caffeine portion wording, allergens and other manufacturer warnings for each variant. Existing high-dose safety flags are preserved. The warning mechanism alone does not satisfy label approval.

## Checklist coverage and review instructions

`docs/compliance-checklist.csv` contains **74 rows**, one for each locally recorded store variant from `data/mapping-review.csv` (T05), matched by Shopify variant ID and observed SKU. It includes historical draft placeholders and held variants so they cannot disappear from review. Affiliate-only rows are excluded. This is a proposed review universe, not confirmation of 74 approved/live launch SKUs. Toby/Lifty must decide the final selection and reconcile it against a separately authorised live read before launch.

The required columns are `NHC claims`, `novel food`, `WADA`, `warnings`, `signed_by`, `signed_date`; SKU, variant and product identity columns make review traceable. Every check starts as TODO, not a tick. Both signature columns are blank. There are no costs, credentials or addresses in the checklist. Only Lifty/Toby should record approval and evidence after checking exact UK labels, ingredients/extracts, claim conditions, current GB novel-food authorisations and current prohibited-list/batch evidence. Informed Sport metadata alone is not WADA clearance. Unknown placeholder supplier identities remain unresolved.

`node scripts/compliance-checklist.mjs` rebuilds the identical local unsigned draft only. It refuses to overwrite a file with changed review text or signatures. Reconcile later source changes manually while preserving review/signature history; do not erase review to regenerate.

## Claims scan and scope of the result

Run `node scripts/claims-scan.mjs` from the repository root. It reads only local files: saved comparison names/brands, mapping proposal product names, `app/products/`, and the warning component/helper. CSV scanning selects copy fields (including description/marketing/body HTML when present), never private mapping notes, IDs or URLs. Pass explicit local files/directories to extend it to approved descriptions, exports, marketing or shop theme copy. Symlinks are refused. Exit codes: 0 clean, 1 findings, 2 invalid/missing input. Findings include file/record/field, line and keyword; negations are not exempted. Tests use synthetic copy and block outbound requests in rendered modules.

Current default scan: **0 keyword hits in 11 local files**. Keywords include cure/curing, treat/treatment, prevent/prevention, detox/detoxification, heal, miracle, fat-burning and disease. **The saved catalogue only contains names/brands/category/serving fields, not full descriptions.** Archived research, all website guides, actual database copy and Shopify descriptions are not declared clear by this result. A zero keyword count cannot prove claims are lawful. Lifty must review complete current copy and permitted claims before sign-off. Do not strip safety warnings merely to obtain zero hits.

## Decisions and external work still required

1. Lifty/Toby: approve the drafts and per-variant checklist evidence/signatures; resolve the exact final launch range and label/ingredient/claim warnings.
2. Toby: confirm food business registration, legal trading identity, geographical address, phone and support arrangements.
3. Lifty/Toby: approve returns/delivery details and data handling/retention/transfer details above, including suppliers/couriers and Shopify policy parity.
4. Later, separately authorised work: inspect Shopify policies/footer and delivery setting, complete full-copy scan and exact SKU reconciliation, and verify hosted CI. No credentials are needed for this offline implementation.

Official review references checked for the draft wording (not legal sign-off):
- [GOV.UK returns and refunds](https://www.gov.uk/accepting-returns-and-giving-refunds): cancellation and refund guidance.
- [GOV.UK distance selling](https://www.gov.uk/online-and-distance-selling-for-businesses): pre-contract delivery/business information and cancellation form.
- [FSA/FSS caffeine supplement guidance](https://www.food.gov.uk/news-alerts/news/fsa-and-fss-issue-guidance-on-caffeine-in-food-supplements): caffeine safety and labelling; does not establish a 16+ legal limit.
- [ICO privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/): recipients, retention and purposes to verify.

## Local verification

- `node --experimental-strip-types --test tests/t12-compliance.test.mjs tests/claims-containment.test.mjs tests/storefront-prices.test.mjs tests/product-mapping.test.mjs tests/catalogue-eligibility.test.mjs`: **195 passed, 0 failed, 0 skipped**, including 10 new T12 tests. These render real warning/product/policy/footer components with synthetic inputs and test scanner exit codes, checklist coverage and preservation of synthetic review signatures.
- `npm run typecheck`: PASS.
- `npm run check:live-boundaries`: PASS, 0 violations.
- `node scripts/claims-scan.mjs`: PASS, 0 hits in 11 local files, with the limitations above.
- Changed-source ESLint: 0 errors, 3 existing footer `<img>` warnings. `git diff --check`: PASS.
- Initial test run exposed two test-fixture errors (expected keyword count and explicit `.mjs` path resolution); corrected before the final passing run. No application failure or repeated failing operation was hidden.
- Hosted CI, browser/Shopify checks, full current product-copy review and human signatures remain outstanding. No commit attempt, push, merge, deployment, env edits, flag changes, live Shopify/supplier/Supabase requests, hosted migration or spend. Work remains local and uncommitted.
