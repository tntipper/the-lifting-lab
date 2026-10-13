# Offline sign-off importer (Job C)

FACT: This tool reads a local XLSX file without modifying it. It exports proposals only,
with no database, network, Shopify or runtime loader binding. Existing price/cart switches
remain unchanged and OFF. Python 3's standard library and the existing Node dependencies
are sufficient; no openpyxl or new npm package is required.

```sh
node --experimental-strip-types scripts/import-signoff.mjs /path/to/signoff.xlsx
# Explicit fee inputs: integer pence and basis points (200 = 2%). These are examples, not approved tariffs.
node --experimental-strip-types scripts/import-signoff.mjs /path/to/signoff.xlsx \
  --payment-fixed-pence 25 --payment-variable-bps 200
# Write only to a NEW local file; existing files and symlinks cannot be overwritten.
node --experimental-strip-types scripts/import-signoff.mjs /path/to/signoff.xlsx \
  --payment-fixed-pence 25 --payment-variable-bps 200 \
  --write --output /path/to/review.generated.json
```

Default worksheet: `Sign-off`; override with `--sheet`. Default mapping candidate input:
`data/mapping-review.csv`; override with `--mapping`. Candidates must use the existing
T04 `ProductMappingRow` columns plus `variant_title`. Resolution requires exactly one
`status=store` row whose handle and variant title equal the workbook values, after trimming
workbook text. No name, SKU or family guesses. Historical candidates provide IDs only,
not proof of current catalogue eligibility.

Workbook headers: `toby_signoff`, `handle`, `variant_title`, `store_price_gbp`,
`trade_cost_ex_vat`, `vat_rate`, `delivery_cost_per_order`, `customer_shipping`.
Optional `payment_fixed_pence` and `payment_variable_bps` supply fees unless both CLI
fee arguments are supplied. Fee values are mandatory for exporting Approved rows;
missing fees are reported rather than assumed zero. `toby_notes`, `missing_reason` and
`match_notes` supply report reasons. Exact decisions are Approved, Rejected and Query;
blank decisions are Undecided and other spellings are invalid. Price and trade cost must
be positive GBP decimals with at most two decimal places. `vat_rate` is the supplier
input tax fraction (e.g. 0.2), never output VAT. Zero shipping, fees and input VAT are
allowed when explicitly entered.

The dry-run report lists every row, counts, decisions, reasons and validation errors.
Rejected, Query and Undecided rows are never exported. Missing prices/IDs/costs/fees,
ambiguous mappings, formula inputs and duplicate approved variants prevent affected
rows exporting. Every duplicate approval is held, including when another member has
invalid price data. With `--write`, any invalid Approved row blocks the entire write.
Reports still run successfully with row validation errors; unreadable input, invalid
arguments or a blocked write return exit code 1. XLSX shared strings, inline strings and
numeric cells are supported. Formula inputs are rejected even with cached values;
formulas and cached values in old margin columns are ignored, not recalculated in Excel.

Output JSON contains `mappings`, `prices`, `margins`, source provenance and
`liveEnabled:false`. Mapping rows contain only T04 private table fields, canonical
Shopify GIDs, `cost_ex_vat` and a worksheet-row approval reference; `active=false` and
`price_auto=false`. Price proposals reuse `ApprovedPrice` fields `shopifyVariantId`,
`currency=GBP`, `amountPence`. GAP: They are not full ApprovedPrice records: no live
observation timestamp, cost/mapping version or catalogue review is manufactured.
They must not be passed to the public StorefrontPrice loader. A later reviewed import
must bind fresh evidence through existing runtime controls. Generated files are private
(mode 0600), must stay out of public product data, and are not automatically loaded.

FACT: TLL is not VAT registered. Correct calculation is:

```
trade cash cost = trade_cost_ex_vat × (1 + supplier input VAT rate)
receipts = selling price + customer shipping (no output VAT deduction)
payment fee = fixed fee + percentage fee on receipts
margin = receipts - trade cash cost - supplier dispatch - payment fee
margin ratio = margin / receipts
```

Amounts are calculated in integer pence with half-up rounding of supplier tax and payment
fees. This is a one-item, one-supplier-order scenario; dispatch is £6 per supplier order,
not proof of basket routing. Negative margins remain visible. Existing
`lib/commerce/pricing-policy.ts` already rejects nonzero output VAT and recoverable input
VAT; no change to that correct policy was necessary. `lib/signoff-margin.ts` applies the
same business basis to workbook proposals and never trusts their saved margin columns.

INFERENCE: The fixture's saved margins deduct selling-price VAT: first row £49.99 / 1.2
less £19.29 wholesale and £6 / 1.2 dispatch plus £4.99 / 1.2 shipping is approximately £21.53,
the saved margin. Correct receipts include the entire selling price; supplier VAT remains
unrecoverable. The fixture contains literal cached results rather than Excel formulas.
It is immutable under this job; corrections appear in generated margins, not its cells.

GAP: The supplied fixture has 243 undecided rows and no approved payment tariff. It
cannot produce approved output until Toby enters decisions and supplies actual fees.
No fresh stock, label, review or live price evidence is available from this workbook.
Related draft PRs and hosted CI were not queried because Job C prohibits network effects.

Proof commands:

```sh
node --experimental-strip-types --test tests/signoff-*.test.mjs tests/product-mapping.test.mjs tests/pricing-policy.test.mjs
node --experimental-strip-types scripts/import-signoff.mjs ../signoff-input.xlsx > ../c-dryrun.md
npm run typecheck
npm run lint
```

Current local evidence: FACT — 132 focused tests pass, including 11 new tests; scoped
library typecheck and syntax/live-boundary checks pass. BLOCKED — full repository
typecheck and full/targeted lint did not finish within bounded waits and were stopped
(exit 130). Dependency resolution reaches the old iCloud node_modules; a full tsc read
trace showed slow Next declaration reads. Git staging/commit is blocked by an
`index.lock` permission error. See `../c-test.log` outside the checkout for exact results.
Repair the local dependency checkout and Git metadata access, rerun the full checks,
and commit before treating Job C as complete. No hosted CI pass is claimed.
