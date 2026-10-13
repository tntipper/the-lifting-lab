# Offline sign-off importer (Jobs C/C2/G)

FACT: This tool reads a local XLSX file without modifying it. It exports proposals only,
with no database, network, Shopify or runtime loader binding. Existing price/cart switches
remain unchanged and OFF. Python 3's standard library and the existing Node dependencies
are sufficient; no openpyxl or new npm package is required.

```sh
node --experimental-strip-types scripts/import-signoff.mjs /path/to/signoff.xlsx
# All three config inputs are required. Example values only, not approved tariffs.
# Basis points: 200 = 2%; reserve applies to selling price, excluding shipping.
node --experimental-strip-types scripts/import-signoff.mjs /path/to/signoff.xlsx \
  --payment-fixed-pence 25 --payment-variable-bps 200 --returns-reserve-bps 100
# Write only to a NEW local file; existing files and symlinks cannot be overwritten.
node --experimental-strip-types scripts/import-signoff.mjs /path/to/signoff.xlsx \
  --payment-fixed-pence 25 --payment-variable-bps 200 --returns-reserve-bps 100 \
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
Required CLI configuration: `--payment-fixed-pence`, `--payment-variable-bps` and
`--returns-reserve-bps`. All are non-negative integers: fixed fee up to 1,000,000,000p,
rates up to 10,000bps. Explicit zero is valid; there are no defaults. Workbook fee
columns are ignored and cannot satisfy missing configuration. Missing inputs appear
as `MISSING_CONFIG` in row errors and as `MISSING_CONFIG:<field>` report gaps.
`--write` refuses any missing configuration, even with no Approved rows or no rows.
The library also reports `INVALID_CONFIG` for invalid supplied values; invalid CLI
values return exit code 1. `toby_notes`, `missing_reason` and
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

Output JSON contains `mappings`, `prices`, `margins`, explicit `config`, source provenance and
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
returns reserve = selling price × returns reserve bps / 10,000
margin = receipts - trade cash cost - supplier dispatch - payment fee - returns reserve
margin ratio = margin / receipts
```

Input amounts are whole pence (Excel float noise within 1e-6 of a whole penny/basis
point is tolerated). Calculations use pricing-policy's exact rational arithmetic without
rounding supplier VAT, percentage fees or reserve prematurely. Generated margin fields
can contain fractional pence; formatting to pounds is a presentation concern. For
example, 3,499p receipts at 200bps plus 25p fixed fee costs 94.98p, not 95p.

`lib/signoff-margin.ts` only re-exports `calculateProposalMargin` from
`lib/commerce/pricing-policy.ts`. The proposal, floor and basket calculations share
one contribution formula. Supplier VAT remains an unrecoverable cost and output VAT
is zero. Reserve is deducted separately and exposed as `returnsReservePence`;
`feesPence` continues to mean payment plus dispatch fees. This is a one-item,
one-supplier-order scenario using workbook dispatch, not proof of basket routing.
Negative margins remain visible; cached workbook margin columns are ignored.

INFERENCE: The fixture's saved margins deduct selling-price VAT: first row £49.99 / 1.2
less £19.29 wholesale and £6 / 1.2 dispatch plus £4.99 / 1.2 shipping is approximately £21.53,
the saved margin. Correct receipts include the entire selling price; supplier VAT remains
unrecoverable. The fixture contains literal cached results rather than Excel formulas.
It is immutable under this job; corrections appear in generated margins, not its cells.

GAP: The supplied fixture has 243 undecided rows and no supplied payment/reserve
configuration. It cannot produce approved output until Toby enters decisions and supplies
actual fixed fees, variable fees and returns reserve.
No fresh stock, label, review or live price evidence is available from this workbook.
Related draft PRs and hosted CI were not queried because Job C prohibits network effects.

Proof commands:

```sh
node --experimental-strip-types --test tests/signoff-*.test.mjs tests/product-mapping.test.mjs tests/pricing-policy.test.mjs
node --experimental-strip-types scripts/import-signoff.mjs ../signoff-input.xlsx > ../c-dryrun.md
```

Current Job G evidence: FACT — 139 acceptance tests pass, 0 fail/skip. The suite
covers missing/partial configuration, explicit zeros, invalid rates, nonzero reserve,
write refusal, unchanged workbook/mapping input and canonical basket parity.
`../g-test.log` holds commands and results. `../c-dryrun.md` reports 243 undecided,
0 Approved/exported and all three `MISSING_CONFIG` gaps. Input SHA256 remains
`c602116ef403d4ac1970223ebf9f0781bc64042632c0c253dad56dbc20863d8b`.
GAP: Hosted CI and draft PR lookup were not run because network is prohibited.
Earlier Job C typecheck/lint limitations remain historical; Job G does not claim a
full repository typecheck/lint or hosted CI pass. No commit, push, merge or deployment.
