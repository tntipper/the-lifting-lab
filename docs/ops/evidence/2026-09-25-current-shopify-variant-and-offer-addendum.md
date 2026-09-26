# Current Shopify variants and proposed offers — read-only addendum

Observed 25 September 2026. **No price, product, stock, shipping rule, discount, customer message or supplier order was changed.** This supersedes only the Shopify-export gap and old-price assumptions in the [earlier same-day screen](2026-09-25-supplier-variant-offer-screen.md). Supplier commercial and label evidence remains dated and provisional.

## Source and limits

Shopify Admin emailed an all-products CSV export to the owner. The two local downloads named `products_export_1.csv` and `products_export_1 (1).csv` are byte-identical, SHA-256 `e6b21d0c590ddc39411ae58c6308ecc62bb4aab564819ab9f7b02848a85221c5`. The raw export stays in Downloads because it includes product-body HTML and other fields unnecessary for this review. The [curated 98-variant register](../../research/data/shopify-current-variant-screen-2026-09-25.csv) retains only product identity, public price/option/barcode, stock settings, historical supplier link and explicit warning flags. It joins the export to the **14 September** `wire-61-shopify-map.csv` by handle plus SKU and to that date's `DropshipProductFeed.csv` by SKU. The live comparison-site identity source is the [229-ID Supabase snapshot](../../research/data/supabase-products-2026-09-25.csv).

The Shopify CSV does not include numeric product or variant IDs, so the historical numeric IDs remain unverified. Its inventory fields show settings, not a supplier stock commitment or a proven checkout outcome. The supplier feed is not a current quote, current stock feed or manufacturer label.

## What the current shop actually contains

| Check | Result | Consequence |
| --- | ---: | --- |
| Shopify products / sellable-variant rows | 87 / 98 | 63 active products (74 variants); 24 draft products (24 variants) |
| Historical comparison map matched by current handle+SKU+listed price | 61/61 map rows | 60 unique variants; two comparison records share `STM008`; no listed price changed from the map |
| Current variants with SKU in old supplier feed | 74/98 | 24 need another supply/identity path; this is not proof they are unavailable |
| Old feed size text appearing in Shopify variant options | 74/74 feed-linked | Text match only; charged unit and formula remain unapproved |
| Explicit supplier multipacks | 10 | Nine old mapped cartons plus a draft Quest 12-pack; exclude from single-unit margins |
| Shopify barcodes | 12/98 | All 12 are ISO-XP variants and match the dated supplier feed; 86 have no Shopify barcode |
| Currently unmapped Shopify product titles that exactly match a comparison brand+name | 12 candidate handles | Name-only suggestions, never approved identity links |

The old comparison register still has **168 of 229 IDs without an approved historical Shopify map**. The 12 title candidates could help a later manual match, but do not reduce that verified gap. A comparison product need not be sold, so the owner must define which of the 229 belong in the shop.

The first manufacturer check remains `APP449` Applied Nutrition creatine. The current Shopify export confirms the 250g option, SKU `APP449` and £24.95 listed price, matching the old handle/SKU/price map. The barcode cell is empty. The [manufacturer page](https://appliednutrition.uk/products/creatine-monohydrate) and old feed make the formula plausible, but no current barcode-bound manufacturer label or exact nutrient-panel revision has been obtained. The same limitation applies to the 12 ISO-XP barcode matches: matching a dated supplier barcode is useful identity evidence, not scientific or label approval.

Two settings need an urgent **read-only storefront check**, followed by a reviewed correction before promotion. Thirteen active, published products have £0 variants, internal `TLL-...` SKUs and no supplier-feed link. Their export rows show quantity zero but inventory tracking blank; a `deny` inventory policy alone does not prove they cannot be ordered. Twelve active ISO-XP variants have Shopify-tracked quantity zero with `continue` selling policy, which is configured to allow orders past zero. Their supplier fulfilment availability is unverified. Do not make a purchase to test either group. Check product visibility, add-to-cart and checkout eligibility only to the permitted non-purchase boundary, then remove or make unavailable any unintended sellable placeholders and turn off overselling until a trusted supplier-stock process exists.

## Updated conditional margin screen

The screen covers **64 feed-linked, non-multipack variants**, 59 active and five draft. Each is treated as one correctly matched supplier sellable unit in its own TropShip order with **£6 gross supplier delivery**. It uses the current listed Shopify price, the **14 September** supplier price, no customer postage revenue, and no payment fee, returns reserve or advertising cost. For promotions, the customer receives 10% off and the affiliate commission is calculated on the discounted merchandise value. A warning means contribution is below the existing **25% margin or £3 cash per-item minimum** under those assumptions. `NO_WARNING_BEFORE_OMITTED_COSTS` does not mean an approved profitable price.

| Scenario | Warnings among all 64 | Warnings among 59 active |
| --- | ---: | ---: |
| Supplier feed price assumed VAT-inclusive; no promotion | 25 | 20 |
| VAT-inclusive; 10% customer discount + 10% first-order commission | **55** | **50** |
| VAT-inclusive; 10% discount + 5% repeat commission | 51 | 46 |
| `VAT` feed prices assumed VAT-exclusive, with 20% extra; no promotion | 50 | 45 |
| VAT-extra; 10% discount + 10% first-order commission | **60** | **55** |
| VAT-extra; 10% discount + 5% repeat commission | 56 | 51 |

The alternative 20% amount is a sensitivity assumption based on [GOV.UK's standard VAT rate](https://www.gov.uk/vat-rates/), **not** a verified per-product tax decision. TLL is not VAT registered, so supplier VAT actually charged would be a cost. For example, current `APP511` ISO-XP is listed at £49.99 and the old feed says £29.67 for 850g. It passes the no-promotion screen if that feed price is VAT-inclusive, but warns under the proposed first-order affiliate offer even before payment fees or returns. This is a reason to review the offer, not a price recommendation.

The proposed **£100 customer free-delivery threshold** should be based on merchandise collected **after discounts**, for mainland UK only pending the supplier's service-area confirmation. At exactly £100 collected merchandise value, 10% first-order commission consumes £10. A 25% contribution margin allows no more than £65 of all remaining costs; one £6 supplier order leaves **£59** for product cost, product VAT, payment fees, returns and other costs. Two separately submitted supplier orders leave **£53**. At the 35% target, those limits are **£49** and **£43**. A £100 basket before a 10% discount becomes £90 and should not receive free customer shipping under this proposed rule. These are upper bounds, not healthy-margin findings: real basket composition, item floors and shipping charge policy must also pass.

## Decisions before activation

1. Obtain fresh account-specific written TropShip confirmation of £5+VAT **per supplier order**, product price VAT basis/rates, charged carton-versus-unit definitions, split-order charges and operational terms. The direct 14 September account email supports the current £6 budget. The [public TropShip page](https://www.tropicanawholesale.com/TROPSHIP/) describes the hourly feed and 4pm service but does not publish that account tariff; the [generic delivery page](https://www.tropicanawholesale.com/help/delivery/) states a £100 wholesale threshold that the account email assigns to a separate wholesale account.
2. Obtain current manufacturer label/specification evidence tied to the exact sellable SKU/barcode and review the comparison-site score/claims against it. Decide which of the 229 comparison products should have a purchase path. Treat title-only suggestions as candidates.
3. Verify and correct unintended £0 listings and zero-stock overselling, without an order. Obtain current supplier prices/stock and the real payment tariff/returns reserve; approve each product's VAT and pack basis before any automatic repricing.
4. Keep customer free delivery and affiliate discounts/commission **disabled** until exact variants and representative one- and two-supplier-order baskets pass the standalone item floor and full order checks. Settle whether the £100 threshold and commission base use post-discount merchandise in written offer terms; the calculation above recommends that basis.
