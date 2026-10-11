# Catalogue preparation review — 3 October 2026

**5 October current position:** Four confirmed conflicting products are excluded from sale; the remaining preparation scope is 59 products / 70 variants with ten zero-stock observations. Supplier trade quotes exclude VAT, confirmed by the original attached reply. TLL is not VAT registered and will charge customers for delivery. The older two-basis worksheet below is historical. UK brand baselines are not yet imported into the database. Use the [current completion plan](../../ops/stage-plans/2026-10-05-catalogue-to-launch-completion.md) and [disposition](../../ops/evidence/2026-10-05-catalogue-disposition.csv).

All 63 planned products and 74 variants have a local draft and source-review record, including the ten variants with zero supplier stock. These documents are for review. They have not been imported into Shopify or published on the website.

## Files to use

- [Products](products.csv): 63 rows with source links, draft locations and zero-stock counts.
- [Variant checks](variants.csv): 74 rows preserving SKU, existing option, supplier barcode/stock observation, manufacturer barcode candidates and unresolved details.
- [Price scenarios](price-review.csv): 61 priced variants, with both possible supplier VAT bases and a separate example where TLL absorbs one £6 supplier delivery charge.
- [Image references](image-references.csv): 187 links from official product data; packaging match and permission to reuse remain unconfirmed.
- [Supplier comparison workbook](../../../outputs/feed-review-2026-10-02/TLL_supplier_feed_comparison_2026-10-02.xlsx): the complete earlier feed comparison.
- [Updated supplier email](../../ops/drafts/tropship-account-confirmation-2026-09-25.md): ready for owner review; not sent.

## What the research establishes

62 official product/family URLs returned HTTP 200; Reflex 100% Whey still returned 404. Forty-four pages supplied structured manufacturer options. Thirty-three launch variants have one candidate option with exactly the same nonempty numeric barcode as the supplier CSV. Missing/empty barcodes never count as matches. A barcode match is useful evidence, but conflicts below show why it cannot approve a supplied pack or label by itself.

Three earlier broken links were replaced with current official research candidates: ON Gold Standard Isolate, ON Platinum Creatine Plus and HR Labs DEFIB. The current DEFIB page does not establish that it is the same version as the TLL V3 placeholder. The SupportMAX source now points to Joint Capsules rather than the unrelated OCS family. Earlier sources remain recorded privately. UK-region paths were retained for ON's structured product data. TrainedByJP sources are European and Mutant's source is US; those pages cannot establish the exact UK label.

| SKU | Difference requiring confirmation |
| --- | --- |
| OPT034 | TLL says 896g Chocolate. Supplier name and the same-barcode brand option say 924g Chocolate Supreme, while supplier Size says 896g. |
| PER183 | TLL and supplier say 900g Cherry Bakewell; same-barcode brand option says 810g. |
| SYN031 | TLL and supplier say Vanilla; same-barcode brand option says Cookies & Cream / 750g. |
| OPT296 | TLL says 775g; current brand family lists 780g. No exact barcode match establishes a replacement. |

The 13 £0 placeholders still lack a selected exact supplier pack. REF152 is absent from the newer supplier CSV and its old official product page is unavailable. All are retained in the preparation range.

## Draft content and label limits

Each product draft includes an original neutral description, the existing variants, source address and capture time, identity questions, short page-text research leads for ingredients/allergens/directions/warnings/nutrition, and candidate image links where available. It also provides the agreed out-of-stock wording. No serving counts, efficacy claims, dietary claims or dosage have been guessed.

Page-text search leads can refer to navigation or another flavour. They are pointers for the label review, not approved selling information. Current exact UK manufacturer/supplier labels and supplied pack/version confirmation are still needed. No exact label record has been approved for publication by this batch.

## Price calculations and decisions

The price worksheet uses TLL's recorded **non-VAT-registered** cash policy: supplier VAT is a cost and there is no output-VAT deduction or input-VAT recovery. Product VAT flags and supplier quote VAT basis are still assumptions awaiting confirmation. This differs from the earlier workbook's net-of-output-VAT gross-margin illustrations; neither worksheet is a final profit or pricing decision.

Before delivery, payment fees, returns or promotions, five listed prices leave negative cash under the ex-VAT-quote assumption: OPT034, STM044, WAR014, BLK101 and OPT156. If TLL absorbs one £6 supplier delivery with no customer shipping receipt, 18 variants leave negative cash under that assumption (10 under the inclusive-quote assumption). This delivery example is deliberately separate: customers may pay shipping, several items may share an order, and actual fees/reserves must be included in the approved basket calculation.

No RRP was established. Supplier quotes are wholesale observations; the listed TLL prices are selling prices. No recommended price is invented while VAT basis, exact units, payment fees and returns reserve are unresolved. Those cells remain blank and every row remains held.

## Work awaiting outside information or owner decisions

1. Send the prepared supplier questions when the owner chooses to do so; obtain the authoritative feed/stock timing/duplicate meaning, VAT basis and exact conflicting packs/current UK labels.
2. Confirm payment fees, returns allowance and customer shipping policy before approving price recommendations. The existing professional pricing calculator is already built and remains disabled for writes.
3. Review the source-bound content and images after exact supplied labels are available; resolve all 74 options, retaining zero-stock products for restock.
4. Feed approved, dated stock and product records into the catalogue's local display contract, then test depletion/restock with those records. No real supplier record is currently approved, so runtime routes do not attach that display contract yet.
5. The stopped v18 website test still needs its missing failure evidence. No new run, deployment or successor package was prepared.

## Product draft index

| Product | Variants | Supplier-zero observations |
| --- | --- | --- |
| [Applied Nutrition 100% Casein Protein](products/applied-nutrition-100-casein.md) | 1 | 0 |
| [Applied Nutrition Amino Fuel EAA](products/applied-nutrition-amino-fuel-eaa.md) | 1 | 0 |
| [Applied Nutrition Creatine Monohydrate](products/applied-nutrition-creatine-monohydrate.md) | 1 | 0 |
| [Applied Nutrition Critical Whey](products/applied-nutrition-critical-whey.md) | 1 | 1 |
| [Applied Nutrition Digestive Enzyme Capsules](products/applied-nutrition-digestive-enzyme-capsules.md) | 1 | 0 |
| [Applied Nutrition Endurance Recovery](products/applied-nutrition-endurance-recovery.md) | 1 | 0 |
| [Applied Nutrition ISO-XP](products/applied-nutrition-iso-xp.md) | 12 | 1 |
| [Applied Nutrition Mass](products/applied-nutrition-mass.md) | 1 | 0 |
| [Bio-Synergy Whey Better®](products/bio-synergy-whey-better.md) | 1 | 0 |
| [Bio-Synergy Whey Hey®](products/bio-synergy-whey-hey.md) | 1 | 0 |
| [Bulk Complete Multivitamin Complex](products/bulk-complete-multivitamin-complex.md) | 1 | 0 |
| [Bulk Creatine Monohydrate](products/bulk-creatine-monohydrate.md) | 1 | 0 |
| [Bulk Electrolyte Powder](products/bulk-electrolyte-powder.md) | 1 | 0 |
| [Bulk Magnesium Bisglycinate](products/bulk-magnesium-bisglycinate.md) | 1 | 0 |
| [Bulk Omega-3 Fish Oil](products/bulk-omega-3-fish-oil.md) | 1 | 0 |
| [Bulk Pure Whey Isolate](products/bulk-pure-whey-isolate.md) | 1 | 0 |
| [Bulk Pure Whey Protein](products/bulk-pure-whey-protein.md) | 1 | 0 |
| [Bulk ZMA](products/bulk-zma.md) | 1 | 0 |
| [CNP Professional CNP EAA](products/cnp-loaded-eaa.md) | 1 | 0 |
| [CNP Pro Creatine](products/cnp-pro-creatine.md) | 1 | 1 |
| [Darkstims Creatine Monohydrate](products/darkstims-creatine-monohydrate.md) | 1 | 1 |
| [Darkstims Electrolytes](products/darkstims-electrolytes.md) | 1 | 0 |
| [Darkstims PRE V4](products/darkstims-pre-v4.md) | 1 | 0 |
| [Ghost Lifestyle Ghost Hydration](products/ghost-hydration.md) | 1 | 0 |
| [Ghost Lifestyle Ghost Legend](products/ghost-legend-v4.md) | 1 | 1 |
| [Grenade Carb Killa (Chocolate Chip Salted Caramel)](products/grenade-carb-killa.md) | 1 | 0 |
| [HR Labs Defib V3](products/hr-labs-defib-v3.md) | 1 | 0 |
| [Mutant GEAAR](products/mutant-geaar.md) | 1 | 0 |
| [MyProtein Creapure Creatine](products/myprotein-creapure-creatine.md) | 1 | 0 |
| [MyProtein Impact Creatine](products/myprotein-impact-creatine.md) | 1 | 0 |
| [MyProtein Impact Whey Protein](products/myprotein-impact-whey-protein.md) | 1 | 0 |
| [MyProtein Origin Pre-Workout](products/myprotein-origin-pre-workout.md) | 1 | 0 |
| [Naughty Boy Menace](products/naughty-boy-menace.md) | 1 | 0 |
| [Optimum Nutrition Electrolyte Powder](products/optimum-nutrition-electrolyte-powder.md) | 1 | 0 |
| [Optimum Nutrition Essential Amino Energy](products/optimum-nutrition-essential-amino-energy.md) | 1 | 0 |
| [Optimum Nutrition Gold Standard 100% Casein](products/optimum-nutrition-gold-standard-100-casein.md) | 1 | 0 |
| [Optimum Nutrition Gold Standard 100% Isolate](products/optimum-nutrition-gold-standard-100-isolate.md) | 1 | 0 |
| [Optimum Nutrition Gold Standard 100% Whey](products/optimum-nutrition-gold-standard-100-whey.md) | 1 | 0 |
| [Optimum Nutrition Micronised Creatine Powder](products/optimum-nutrition-micronised-creatine-powder.md) | 1 | 0 |
| [Optimum Nutrition Platinum Creatine Plus](products/optimum-nutrition-platinum-creatine-plus.md) | 1 | 0 |
| [Optimum Nutrition Platinum Pre-Workout](products/optimum-nutrition-platinum-pre-workout.md) | 1 | 1 |
| [Optimum Nutrition Serious Mass](products/optimum-nutrition-serious-mass.md) | 1 | 0 |
| [Per4m Advanced Whey](products/per4m-advanced-whey.md) | 1 | 0 |
| [Per4m EAA](products/per4m-eaa.md) | 1 | 0 |
| [Per4m Isolate](products/per4m-isolate.md) | 1 | 1 |
| [Reflex Nutrition 100% Whey](products/reflex-nutrition-100-whey.md) | 1 | 0 |
| [Reflex Nutrition Isolate Pro](products/reflex-nutrition-isolate-pro.md) | 1 | 1 |
| [Sci-MX Ultra Whey](products/sci-mx-ultra-whey.md) | 1 | 1 |
| [SiS Go Hydro](products/sis-go-hydro.md) | 1 | 0 |
| [Strom Sports Nutrition EssentialMax](products/strom-essentialmax-eaa.md) | 1 | 0 |
| [Strom Hydramax](products/strom-hydramax.md) | 1 | 0 |
| [Strom Sports Nutrition SupportMAX](products/strom-sports-nutrition-supportmax.md) | 1 | 0 |
| [Strom Sports Nutrition ZMAX](products/strom-sports-nutrition-zmax.md) | 1 | 0 |
| [Strom Sports Nutrition StimuMAX PRO](products/strom-stimumax-pro.md) | 1 | 0 |
| [The Formula NEUPHORIC](products/the-formula-neuphoric.md) | 1 | 0 |
| [The Protein Works Whey 80](products/the-protein-works-whey-80.md) | 1 | 0 |
| [TrainedByJP JP EAA](products/trainedbyjp-jp-eaa.md) | 1 | 0 |
| [TrainedByJP JP Hydration](products/trainedbyjp-jp-hydration.md) | 1 | 1 |
| [TrainedByJP Prepare](products/trainedbyjp-prepare.md) | 1 | 0 |
| [USN Muscle Fuel Anabolic](products/usn-muscle-fuel-anabolic.md) | 1 | 0 |
| [Warrior Creatine Monohydrate](products/warrior-creatine-monohydrate.md) | 1 | 0 |
| [Warrior Crunch Bar (White Chocolate Crisp)](products/warrior-crunch-bar.md) | 1 | 0 |
| [Warrior EAA Powder](products/warrior-eaa-powder.md) | 1 | 0 |
