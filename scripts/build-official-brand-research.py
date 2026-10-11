"""Build the 30 September official-brand research queue from the Shopify readback.

Source URLs and observations are deliberately reviewed constants, not scraped prices.
"""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
READBACK = ROOT / "docs/ops/evidence/2026-09-30-shopify-variant-readback.csv"
OUTPUT = ROOT / "docs/research/2026-09-30-official-brand-price-research.csv"
PRODUCT_OUTPUT = ROOT / "docs/research/2026-09-30-official-brand-products.csv"

# Shopify handle -> official brand URL found in the 30 September web research.
SOURCE_LINES = """
applied-nutrition-100-casein|https://appliednutrition.uk/products/micellar-casein-protein
applied-nutrition-amino-fuel-eaa|https://appliednutrition.uk/products/amino-fuel-390g
applied-nutrition-creatine-monohydrate|https://appliednutrition.uk/products/creatine-monohydrate
applied-nutrition-critical-whey|https://appliednutrition.uk/products/critical-whey
applied-nutrition-digestive-enzyme-capsules|https://appliednutrition.uk/products/digestive-enzymes-capsules
applied-nutrition-endurance-recovery|https://appliednutrition.uk/collections/strength/products/velocity-fuel-recovery-post-exercise-recovery-drink
applied-nutrition-iso-xp|https://appliednutrition.uk/products/iso-xp
applied-nutrition-mass|https://appliednutrition.uk/products/critical-mass-professional
bio-synergy-whey-better|https://bio-synergy.uk/products/bio-synergy-whey-better
bio-synergy-whey-hey|https://bio-synergy.uk/products/bio-synergy-whey-hey%C2%AE
bulk-complete-multivitamin-complex|https://www.bulk.com/uk/products/complete-multivitamin-complex/bble-cmvc
bulk-creatine-monohydrate|https://www.bulk.com/uk/products/creatine-monohydrate/bpb-cmon-0000
bulk-electrolyte-powder|https://www.bulk.com/uk/products/electrolyte-powder/bpb-elec-0000
bulk-magnesium-bisglycinate|https://www.bulk.com/uk/products/magnesium-bisglycinate-tablets/bpb-magb-0000
bulk-omega-3-fish-oil|https://www.bulk.com/uk/products/omega-3-fish-oil-softgels/bpb-omg3-0000
bulk-pure-whey-isolate|https://www.bulk.com/uk/products/pure-whey-isolate-90/bpb-wpi9-0000
bulk-pure-whey-protein|https://www.bulk.com/uk/products/pure-whey-protein/bpb-wpc8-0000
bulk-zma|https://www.bulk.com/uk/products/zma-capsules/bpb-zma-0000
cnp-loaded-eaa|https://cnpprofessional.co.uk/products/loaded-eaa
cnp-pro-creatine|https://cnpprofessional.co.uk/products/creatine-monohydrate-powder
darkstims-creatine-monohydrate|https://www.darkstims.com/products/darkstims-creatine
darkstims-electrolytes|https://www.darkstims.com/products/darkstims-electrolytes
darkstims-pre-v4|https://www.darkstims.com/products/darkstimspre
ghost-hydration|https://uk.ghostlifestyle.com/collections/supplements/products/ghost-hydration-kiwi-strawberry
ghost-legend-v4|https://uk.ghostlifestyle.com/products/ghost-legend-x-bubblicious-strawberry-splash
grenade-carb-killa|https://www.grenade.com/products/protein-bar-chocolate-salted-caramel
hr-labs-defib-v3|https://hr-labs.co.uk/collections/all-products
mutant-geaar|https://mutantnation.com/collections/automatic/products/geaar-recover-now
myprotein-creapure-creatine|https://www.myprotein.com/p/sports-nutrition/the-creatine-creapure/10529740/
myprotein-impact-creatine|https://www.myprotein.com/p/sports-nutrition/creatine-monohydrate-powder/10530050/
myprotein-impact-whey-protein|https://www.myprotein.com/p/sports-nutrition/impact-whey-protein-powder/10530943/
myprotein-origin-pre-workout|https://www.myprotein.com/p/sports-nutrition/origin-pre-workout/12941037/
naughty-boy-menace|https://naughtyboylifestyle.com/products/naughty-boy-menace-pre-workout
optimum-nutrition-electrolyte-powder|https://www.optimumnutrition.com/en-gb/products/electrolyte-powder
optimum-nutrition-essential-amino-energy|https://www.optimumnutrition.com/en-gb/pages/anytime-energy
optimum-nutrition-gold-standard-100-casein|https://www.optimumnutrition.com/en-gb/products/gold-standard-100-casein-protein-powder-eu
optimum-nutrition-gold-standard-100-isolate|https://www.optimumnutrition.com/en-gb/Products/Protein-Powders/Gold-Standard-100%25-Isolate-Whey-Protein-powder/p/1145510
optimum-nutrition-gold-standard-100-whey|https://www.optimumnutrition.com/en-gb/products/gold-standard-100-whey-protein-powder-eu
optimum-nutrition-micronised-creatine-powder|https://www.optimumnutrition.com/en-gb/products/micronised-creatine-powder
optimum-nutrition-platinum-creatine-plus|https://www.optimumnutrition.com/en-gb/Products/Muscle-Building/Platinum-Creatine-Plus-Powder---350g-%2850-Servings%29/p/1150779
optimum-nutrition-platinum-pre-workout|https://www.optimumnutrition.com/en-gb/products/platinum-pre-workout-powder
optimum-nutrition-serious-mass|https://www.optimumnutrition.com/en-gb/products/serious-mass-weight-gainer-protein-powder-eu
per4m-advanced-whey|https://per4mbetter.com/products/cherry-bakewell-whey-protein
per4m-eaa|https://per4mbetter.com/products/per4m-amino-xtra-lemon-lime-splash
per4m-isolate|https://per4mbetter.com/products/chocolate-creme-isolate-zero
reflex-nutrition-100-whey|https://reflexnutrition.com/products/100-whey
reflex-nutrition-isolate-pro|https://reflexnutrition.com/products/isolate-pro
sci-mx-ultra-whey|https://sci-mx.co.uk/products/ultra-whey-protein-1
sis-go-hydro|https://www.scienceinsport.com/shop-by-need/hydration/go-hydro-hydration-tablets/sis-hydro-tablets-pack
strom-essentialmax-eaa|https://www.stromsports.com/products/essentialmax-eaa
strom-hydramax|https://www.stromsports.com/products/hydramax
strom-sports-nutrition-supportmax|https://www.stromsports.com/products/strom-presents-supportmax
strom-sports-nutrition-zmax|https://www.stromsports.com/products/strom-zmax-45-servings
strom-stimumax-pro|https://www.stromsports.com/products/strom-presents-stimumaxpro-v2
the-formula-neuphoric|https://www.theformula.shop/products/neuphoric
the-protein-works-whey-80|https://www.theproteinworks.com/whey-protein-80-concentrate
trainedbyjp-jp-eaa|https://tb-jp.eu/product/eaa-plus-hydration/
trainedbyjp-jp-hydration|https://tb-jp.eu/product/hydration/
trainedbyjp-prepare|https://tb-jp.eu/product/prepare-pro/
usn-muscle-fuel-anabolic|https://www.usn.co.uk/products/muscle-fuel-anabolic
warrior-creatine-monohydrate|https://teamwarrior.com/products/warrior-creatine-monohydrate-powder
warrior-crunch-bar|https://teamwarrior.com/products/warrior-crunch-protein-bars-12s
warrior-eaa-powder|https://teamwarrior.com/products/warrior-eaa-360g
"""

SOURCES = dict(line.split("|", 1) for line in SOURCE_LINES.strip().splitlines())
# GBP prices displayed by the brand. FAMILY_UNBOUND means the displayed price
# could be for another size/flavour, so it must never be used as a variant price.
BRAND_PRICE = {
    "APP016": ("23.95", "FAMILY_UNBOUND"),
    "APP385": ("29.95", "FAMILY_UNBOUND"),
    "SYN031": ("49.99", "FAMILY_UNBOUND"),
    "SYN033": ("39.99", "FAMILY_UNBOUND"),
    "DRK002": ("18.00", "EXACT_PACK_AND_FLAVOUR"),
    "DRK021": ("35.00", "FAMILY_UNBOUND"),
    "TLL-darkstims-electrolytes": ("20.00", "PACK_NOT_SELECTED"),
    "GH0027": ("29.99", "FLAVOUR_ONLY_SIZE_UNBOUND"),
    "GH0080": ("38.99", "FLAVOUR_ONLY_SIZE_UNBOUND"),
    "GRE091": ("22.00", "EXACT_PACK_AND_FLAVOUR"),
    "PER012": ("49.99", "NAMED_BRAND_PACK_TLL_IDENTITY_UNRESOLVED"),
    "PER042": ("32.99", "NAMED_BRAND_FAMILY_TLL_IDENTITY_UNRESOLVED"),
    "REF170": ("89.99", "FAMILY_UNBOUND"),
    "STM008": ("29.95", "FAMILY_UNBOUND"),
    "STM077": ("24.00", "FAMILY_UNBOUND"),
    "TLL-strom-hydramax": ("39.00", "PACK_NOT_SELECTED"),
}
IDENTITY_CHECK = {
    "APP385": "Current brand flavour is Chocolate Cream; TLL says Chocolate.",
    "APP613": "Current brand flavour is Chocolate Milkshake and product is reformulated.",
    "APP028": "Brand offers Original and Professional Critical Mass; TLL name is ambiguous.",
    "OPT296": "Current UK brand page lists 780g; TLL records 775g.",
    "STM044": "SupportMAX has different formulas; exact 160-caps item is unresolved.",
    "CNP332": "Brand uses Creatine Monohydrate Powder name; confirm TLL Pro Creatine 500g.",
    "PER042": "Brand calls current product EAA Xtra; confirm TLL EAA formula.",
    "PER012": "Brand calls current product Isolate Zero; confirm TLL Isolate formula.",
    "WAR039": "Brand confirms 12x64g White Chocolate; old and new presentation shown.",
    "TBJ019": "Official European page lists Fizzy Blue Bottle; GBP price and exact UK supplier pack remain unverified.",
    "TBJ133": "Official European page lists Melon & Apple; compare TLL Apple Melon name and exact UK pack.",
    "TLL-trainedbyjp-prepare": "Official European page is PrePare Pro; TLL has no pack or flavour selection.",
}
FIELDS = [
    "sku", "shopify_handle", "shopify_variant_title", "tll_price_gbp",
    "official_brand_url", "brand_site_region", "source_match_status", "brand_direct_price_gbp", "brand_price_scope",
    "rrp_gbp", "research_note", "checked_on", "g1_disposition",
]

rows = []
with READBACK.open(newline="") as source:
    for variant in csv.DictReader(source):
        if variant["shopify_status"] != "ACTIVE":
            continue
        sku = variant["sku"]
        handle = variant["shopify_handle"]
        title = variant["variant_title"]
        url = SOURCES.get(handle, "")
        region = "EU" if handle.startswith("trainedbyjp-") else ("US" if handle == "mutant-geaar" else "UK")
        status = "FAMILY_PAGE_FOUND" if url else "NO_OFFICIAL_PRODUCT_PAGE_FOUND"
        if title == "Default Title":
            status = "PACK_NOT_SELECTED"
        if sku in IDENTITY_CHECK:
            status = "PRODUCT_IDENTITY_NEEDS_RESOLUTION"
        if sku in ("DRK002", "GRE091"):
            status = "EXACT_PACK_AND_FLAVOUR_ON_BRAND_PAGE"
        rows.append({
            "sku": sku,
            "shopify_handle": handle,
            "shopify_variant_title": title,
            "tll_price_gbp": variant["price_gbp"],
            "official_brand_url": url,
            "brand_site_region": region,
            "source_match_status": status,
            "brand_direct_price_gbp": BRAND_PRICE.get(sku, ("", ""))[0],
            "brand_price_scope": BRAND_PRICE.get(sku, ("", ""))[1],
            "rrp_gbp": "",
            "research_note": IDENTITY_CHECK.get(sku, "Exact pack, flavour, barcode, current label and price still need a source-bound review."),
            "checked_on": "2026-09-30",
            "g1_disposition": "HOLD",
        })

assert len(rows) == 74
assert len({row["shopify_handle"] for row in rows}) == 63
with OUTPUT.open("w", newline="") as target:
    writer = csv.DictWriter(target, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(rows)
groups = {}
for row in rows:
    groups.setdefault(row["shopify_handle"], []).append(row)
product_fields = [
    "shopify_handle", "active_variant_count", "tll_variant_skus", "tll_size_flavour_options",
    "official_brand_product_url", "brand_site_region", "observed_brand_direct_prices",
    "product_research_state", "rrp_status",
]
with PRODUCT_OUTPUT.open("w", newline="") as target:
    writer = csv.DictWriter(target, fieldnames=product_fields)
    writer.writeheader()
    for handle, variants in groups.items():
        writer.writerow({
            "shopify_handle": handle,
            "active_variant_count": len(variants),
            "tll_variant_skus": " | ".join(v["sku"] for v in variants),
            "tll_size_flavour_options": " | ".join(v["shopify_variant_title"] for v in variants),
            "official_brand_product_url": variants[0]["official_brand_url"],
            "brand_site_region": variants[0]["brand_site_region"],
            "observed_brand_direct_prices": " | ".join(
                f"{v['sku']}=GBP {v['brand_direct_price_gbp']} ({v['brand_price_scope']})"
                for v in variants if v["brand_direct_price_gbp"]
            ),
            "product_research_state": "PACK_NOT_SELECTED" if variants[0]["shopify_variant_title"] == "Default Title" else ("BRAND_PAGE_FOUND_VARIANT_CHECK_OPEN" if variants[0]["official_brand_url"] else "NO_OFFICIAL_PAGE_FOUND"),
            "rrp_status": "NO_EXPLICIT_MANUFACTURER_RRP_ESTABLISHED",
        })
print(f"{len(rows)} variants; {len(set(row['shopify_handle'] for row in rows))} products; "
      f"{sum(bool(row['official_brand_url']) for row in rows)} brand links; "
      f"{sum(bool(row['brand_direct_price_gbp']) for row in rows)} direct prices")
print("Missing brand pages:", [(row["sku"], row["shopify_handle"]) for row in rows if not row["official_brand_url"]])
