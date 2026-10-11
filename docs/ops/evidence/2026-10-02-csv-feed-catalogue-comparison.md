# Newer TropShip CSV: validation and launch catalogue comparison

## Source and method

The owner authorised validation of the newer CSV and comparison against the original catalogue workbook. Raw source: `../implementation-state/supplier-private/received-20261002T062926Z-DropshipProductFeed.csv`, 4,429,174 bytes, SHA-256 `3ad4cd1d4d61667bab484f34532c8c67b03b3d9ff85d0ff3b8059b101d1e8a06`. The prior download-method audit proved two identical fresh transfers matching server size. Server date is 2 October, but listing formats disagree by one hour and the stock observation time is unconfirmed.

Strict raw parsing fails at physical line 2362. All 8,743 data records occupy one physical line each with an exact outer quoted boundary and 14 fields separated by the quoted delimiter. Eleven rows contain unescaped inch marks in RDX belt product names. For those rows only, the bounded 14-field split retained every field's literal contents; all other rows use strict CSV parsing. No launch SKU occurs among the 11 repaired rows. A separate diagnostic CSV reserialises these fields with valid quoting; the original is unchanged. Strict Python roundtrip preserves all fields, and the existing disabled JavaScript feed checker independently agrees with all 8,743 field dictionaries. No source row was dropped or unknown product identity inferred.

The existing checker reports complete accounting, 8,743 valid-width rows, zero unassigned rows and no parser failure on the diagnostic copy, with 5,238 distinct product codes and 2,288 duplicate-code groups. It remains HOLD for unconfirmed observation time and row meaning. Wider feed issues also include 17 negative stock rows, one nonpositive quote, missing/unverified barcodes and missing label fields. Normalisation is a local diagnostic interpretation, not an approved production parser change or supplier correction.

## Comparison results

The original `TLL_product_catalogue_2026-10-02.xlsx` was read directly and its 74 SKU, Shopify price and historical wholesale cells verified against the comparison inputs. Exact SKU matching yields:

- 60 matched launch variants: 36 single rows and 24 duplicate groups.
- All 24 matched duplicate groups agree on name, quote, stock, tax, size, barcode, brand and flavour; no conflicting matched group. No duplicate is designated an authoritative supplier row.
- All 60 matched quotes equal the workbook's 14 September wholesale prices; no quote increase or decrease.
- All 60 matched pack-size strings agree with the historical supplier pack string. This is not independent pack/barcode/label approval.
- 10 matched variants report zero supplier stock.
- 14 launch SKUs are missing: the 13 zero-price Draft placeholders plus `REF152`, whose historical wholesale was £14.70.

The original workbook has no supplier stock column, so the new workbook adds the CSV stock observations and separately labels Shopify stock, tracking and selling policy as the saved 30 September readback. No claim is made about stock movement since 14 September.

## Zero-stock supplier observations

| SKU | Catalogue product | Saved Shopify tracking / selling policy |
| --- | --- | --- |
| CNP332 | CNP Pro Creatine — 500g | false / DENY |
| DRK002 | Darkstims Creatine Monohydrate — 500g Unflavoured | false / DENY |
| TBJ133 | TrainedByJP JP Hydration — 300g Apple Melon | false / DENY |
| GH0080 | Ghost Lifestyle Ghost Legend — 660g Bubblicious Strawberry Splash | false / DENY |
| OPT247 | Optimum Nutrition Platinum Pre-Workout — 420g Fruit Punch | false / DENY |
| APP675 | Applied Nutrition ISO-XP — Cafe Latte / 850g | true / CONTINUE |
| PER012 | Per4m Isolate — 900g Chocolate Creme | false / DENY |
| REF170 | Reflex Nutrition Isolate Pro — 1.8kg Chocolate | false / DENY |
| APP613 | Applied Nutrition Critical Whey — 825g Chocolate | false / DENY |
| SMX001 | Sci-MX Ultra Whey — 800g Chocolate | false / DENY |

An untracked Shopify inventory quantity does not establish supplier availability. In particular APP675 is one of the ISO-XP tracked variants with CONTINUE policy; this new observation does not close the wider 12-variant Shopify overselling issue.

## Output and remaining decisions

Comparison workbook: `outputs/feed-review-2026-10-02/TLL_supplier_feed_comparison_2026-10-02.xlsx`. It preserves historical wholesale figures alongside newer supplier quotes, formula-calculated quote differences, source-line references, match/duplicate status, stock and pack observations. Summary counts were checked against independent Python analysis; formula-error scan returned zero matches. Both sheets were rendered for visual verification.

G1/G2 remain open for actual supplier observation time, duplicate semantics, XML/CSV price VAT basis, exact pack/barcode/label and stock acceptance. These are supplier quote observations, not RRPs or approved current costs. The newer CSV is useful evidence; do not repeat the earlier broad claim that no updated feed exists. No Shopify price, stock, product status, order, supplier request, hosted deployment or Stage 3 activation was changed. Next: supplier confirmation of quote VAT basis, repeated-row meaning and stock time; investigate the ten zero-stock observations and missing REF152; retain £0 placeholders in Draft. Stage 3 no-run hold remains.
