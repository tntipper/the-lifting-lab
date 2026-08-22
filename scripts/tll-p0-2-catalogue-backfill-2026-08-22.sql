-- TLL-P0-2 — Catalogue completeness backfill (generated 2026-08-22 by scripts/_gen-p0-2-sql.mjs)
-- Run in the Supabase SQL Editor. Plain UPDATEs by id — idempotent / safe to re-run.
--
-- RULE: every value below is copied from a cited source already in the repo. Nothing is
-- estimated or inferred. Rows whose value depended on an inference (pack-size guess,
-- product-identity mismatch, derived dosing maths) are NOT applied — they sit commented
-- out in Section E for a human decision.
--
-- Sections:  A servings (high-confidence, cited)   B Bulk image_url (cited, HTTP 200)
--            C buy_url gap-fills (cited)            D buy_url dead-link repairs (cited)
--            E NOT applied — needs a decision

BEGIN;

-- ============================================================
-- A. servings_per_container / serving_size / serving_unit
--    Source: scripts/_verify-consolidated.json (2026-06-29 verification pass; each row
--    cross-checked against the listed retailer/brand pages; pack size matched to retail_price).
--    Only final_confidence = high rows are applied here.
-- ============================================================
-- PhD Nutrition — Creapure Creatine  (retail_price £30)
--   source: https://www.zavvi.com/nutrition-and-supplements/phd-nutrition-creatine-monohydrate/10665439.html
--   source: https://www.lookfantastic.com/p/nutrition-and-supplements/phd-nutrition-creatine-monohydrate/10665439/
UPDATE public.products SET servings_per_container = 110, serving_size = 5 WHERE id = '08cea092-e58a-46fb-80d4-343e7ae50170';

-- CNP — Pro Creatine  (retail_price £11.99)
--   source: https://www.discount-supplements.co.uk/products/cnp-pro-creatine-250g
--   source: https://www.proteinpickandmix.co.uk/cnp-creatine-monohydrate-powder-50-servings/
UPDATE public.products SET servings_per_container = 50, serving_size = 5 WHERE id = 'a3f45925-cabd-4a7b-bca8-837824a3f891';

-- Myprotein — Crispy Layered Bar (White Chocolate Peanut)  (retail_price £1.6)
--   source: https://www.myprotein.com/p/sports-nutrition/crispy-layered-protein-bar/12856629/
UPDATE public.products SET servings_per_container = 1, serving_size = 58 WHERE id = '6b79b914-ae67-492f-aaef-ee607fde0074';

-- Optimum Nutrition — Micronised Creatine Powder  (retail_price £20)
--   source: https://www.amazon.co.uk/Optimum-Nutrition-Micronised-Monohydrate-Development/dp/B00T7L20AQ
--   source: https://proteinpackage.co.uk/products/optimum-nutrition-micronised-creatine-monohydrate
UPDATE public.products SET servings_per_container = 93, serving_size = 3.4 WHERE id = '3099922b-46a2-4767-87ee-3359e47729b5';

-- Optimum Nutrition — Platinum Creatine Plus  (retail_price £24.99)
--   source: https://www.optimumnutrition.com/en-gb/products/platinum-creatine-plus-powder
UPDATE public.products SET servings_per_container = 50, serving_size = 7 WHERE id = '87467312-0a01-4f48-9022-184c8a8e705c';

-- Combat Fuel — Cycle Support  (retail_price £32.99)
--   source: https://combat-fuel.co.uk/product/supportmax-ocs/
--   source: https://www.stromsports.com/products/strom-presents-supportmax
UPDATE public.products SET servings_per_container = 30, serving_size = 4, serving_unit = 'capsule' WHERE id = '6774996b-6f6f-4e67-bd31-b93213cea022';

-- Alpha Neon — Synergiz (Maximum Organ Support)  (retail_price £34.99)
--   source: https://alphaneontm.com/products/synergiz
--   source: https://www.dolphinfitness.co.uk/en/alpha-neon-synergiz-120-capsules/407437
UPDATE public.products SET servings_per_container = 30, serving_size = 4, serving_unit = 'capsule' WHERE id = '06ca0109-8e25-481b-b67a-0965d8d737a5';

-- Chemical Warfare — Organ Shield  (retail_price £29.99)
--   source: https://www.chemical-warfare.com/products/bomb-proof-organ-support-90-caps
--   source: https://www.theboxsupplements.co.uk/products/chemical-warfare-on-cycle-organ-support-90caps
UPDATE public.products SET servings_per_container = 30, serving_size = 3, serving_unit = 'capsule' WHERE id = '7d1a4561-ef23-488e-aa33-f1b0e6f78a51';

-- Warrior — Crunch Bar (White Chocolate Crisp)  (retail_price £2)
--   source: https://www.tesco.com/groceries/en-GB/products/310154378
--   source: https://teamwarrior.com/products/warrior-crunch-protein-bars-12s
UPDATE public.products SET servings_per_container = 1, serving_size = 64 WHERE id = '8ddfc493-0872-4235-ba25-5091ef172b49';

-- Myprotein — Layered Protein Bar (Salted Caramel)  (retail_price £1.8)
--   source: https://www.myprotein.com/p/sports-nutrition/layered-protein-bar/13032821/
--   source: https://us.myprotein.com/p/sports-nutrition/layered-bar-single/15298281/
UPDATE public.products SET servings_per_container = 1, serving_size = 60 WHERE id = 'e4fd101e-4969-4054-92ab-f02d4cb3d494';

-- Quest Nutrition — Quest Bar (Chocolate Chip Cookie Dough)  (retail_price £2.5)
--   source: https://www.questnutrition.com/products/chocolate-chip-cookie-dough-protein-bar
--   source: https://uk.iherb.com/pr/quest-nutrition-protein-bar-chocolate-chip-cookie-dough-12-bars-2-12-oz-60-g-each/63559
--   source: https://www.amazon.co.uk/Quest-Nutrition-Chocolate-Cookie-Protein/dp/B00DLDH1N2
UPDATE public.products SET servings_per_container = 1, serving_size = 60 WHERE id = '0aa95107-59ac-4c3c-bec9-afc1b10efcb8';

-- Yfood — Classic (Choco)  (retail_price £3.5)
--   source: https://uk.yfood.com/products/drink-classic-choco-en
--   source: https://www.tesco.com/groceries/en-GB/products/315351845
--   source: https://www.sainsburys.co.uk/gol-ui/product/yfood-this-is-food-classic-choco-500ml
UPDATE public.products SET servings_per_container = 1, serving_size = 500, serving_unit = 'ml' WHERE id = 'f951cf02-9536-4e73-ac62-17bb7a8a33d0';

-- Grenade — Carb Killa (Chocolate Chip Salted Caramel)  (retail_price £22.99)
--   source: https://www.grenade.com/products/protein-bar-chocolate-salted-caramel
UPDATE public.products SET servings_per_container = 12, serving_size = 60 WHERE id = '0379e5a9-bdae-4b68-aee2-787a3314fd08';

-- Nutrition Geeks — Vitamin D 4000iu Max Strength  (retail_price £7.99)
--   source: https://nutritiongeeks.co/products/vitamin-d-4000iu-max-strength-immune-support
UPDATE public.products SET servings_per_container = 365, serving_size = 1, serving_unit = 'tablet' WHERE id = '706e3947-460b-4253-9810-c88919dd5ecd';

-- PhD Nutrition — Smart Bar (Cookies & Cream)  (retail_price £2.3)
--   source: https://www.phd.com/phd-smart-bar-cookies-cream-12-x-64g
UPDATE public.products SET servings_per_container = 1, serving_size = 64 WHERE id = '7da1faee-bd26-4b52-a718-3bbf5f3ab03b';

-- Naughty Boy — Life Pac / Life Support  (retail_price £39.99)
--   source: https://naughtyboylifestyle.com/products/naughty-boy-prime-life-pac
--   source: https://www.amazon.co.uk/NAUGHTY-BOY-Life-PAC-Multivitamin/dp/B0BHJ83MSD
--   source: https://www.activesportsnutrition.co.uk/naughty-boy-prime-life-pac
UPDATE public.products SET servings_per_container = 30, serving_size = 1, serving_unit = 'pack' WHERE id = '290eb8dc-d5a7-4b25-a029-a145bfcc12f3';

-- Nutrition Geeks — Magnesium Glycinate 3-in-1  (retail_price £9.99)
--   source: https://nutritiongeeks.co/products/magnesium-glycinate-3-in-1
UPDATE public.products SET servings_per_container = 45, serving_size = 2, serving_unit = 'capsule' WHERE id = '1cfa7540-1982-4a71-9717-0049c8ccaff0';

-- Nutrition Geeks — Ashwagandha Calm+  (retail_price £8.99)
--   source: https://nutritiongeeks.co/products/ashwagandha-calm
UPDATE public.products SET servings_per_container = 60, serving_size = 1, serving_unit = 'capsule' WHERE id = '1fb58e7f-9504-4a36-863e-0e4071e0d2e3';

-- Supplement Needs — Vitamin D3 and K2 (MK-7)  (retail_price £24.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-vitamin-d3-and-k2-mk-7-120-tabs
UPDATE public.products SET servings_per_container = 120, serving_size = 1, serving_unit = 'tablet' WHERE id = 'd6daeb9d-85c6-4e5f-80ff-648e689bc0e3';

-- Nutrition Geeks — Vitamin D3 4000iu + K2  (retail_price £9.99)
--   source: https://nutritiongeeks.co/products/vitamin-d3-4000iu-k2
UPDATE public.products SET servings_per_container = 365, serving_size = 1, serving_unit = 'tablet' WHERE id = '259e8f60-1171-4f57-9483-2713b7980792';

-- Nutrition Geeks — Zinc Picolinate 3-in-1  (retail_price £9.99)
--   source: https://nutritiongeeks.co/products/zinc-picolinate-3-in-1
UPDATE public.products SET servings_per_container = 365, serving_size = 1, serving_unit = 'tablet' WHERE id = 'efb4879f-a240-4cda-9da0-8fbf094c5596';

-- Nutrition Geeks — Vitamin B12 Dual Power  (retail_price £8.99)
--   source: https://nutritiongeeks.co/products/vitamin-b12-dual-power-1-year-supply
UPDATE public.products SET servings_per_container = 365, serving_size = 1, serving_unit = 'tablet' WHERE id = 'cefa4a30-be66-4083-ac36-e55d9325e39e';

-- Supplement Needs — Vitamin D3  (retail_price £8.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-vitamin-d3-120-tablets
UPDATE public.products SET servings_per_container = 120, serving_size = 1, serving_unit = 'tablet' WHERE id = '1adf3959-7166-4232-b2a9-2e1a7dba2f87';

-- Supplement Needs — Magnesium Bisglycinate  (retail_price £14.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-magnesium-bisglycinate-120-capsules
UPDATE public.products SET servings_per_container = 60, serving_size = 2, serving_unit = 'capsule' WHERE id = '31d19045-0da2-4430-83a8-471f1d45507c';

-- Supplement Needs — Ashwagandha Organic Vegan KSM-66  (retail_price £17.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-ashwagandha-ksm-66-60-capsules
--   source: https://www.supplementneeds.co.uk/products/supplement-needs-vegan-ashwagandha-ksm-66-60-capsules
UPDATE public.products SET servings_per_container = 60, serving_size = 1, serving_unit = 'capsule' WHERE id = '47dc8c3e-814e-47c1-b463-991058f24a5e';

-- Strom Sports Nutrition — Creapure  (retail_price £34)
--   source: https://www.stromsports.com/products/strom-presents-creamax-with-patented-creapure
--   source: https://gym-beast.co.uk/products/strom-sports-nutrition-creamax-83-servings
UPDATE public.products SET servings_per_container = 83, serving_size = 6 WHERE id = 'f2d370c9-333c-4c68-ba67-7cbd0e3d7b74';

-- Strom Sports Nutrition — SupportMAX  (retail_price £34.95)
--   source: https://www.stromsports.com/products/strom-presents-supportmax
UPDATE public.products SET servings_per_container = 30, serving_size = 4, serving_unit = 'capsule' WHERE id = 'ff0521c4-d5ac-44d3-9b9e-cdcda133d059';

-- Bulk — Creatine Monohydrate  (retail_price £24.99)
--   source: https://www.bulk.com/uk/products/creatine-monohydrate/bpb-cmon-0000
--   source: https://www.amazon.co.uk/BULK-POWDERS-Creatine-Monohydrate-Unflavoured/dp/B00IZD28QS
UPDATE public.products SET servings_per_container = 200, serving_size = 5 WHERE id = 'f311ed1d-0f55-44f5-8953-c35d84e6b5ae';

-- Bulk — Macro Munch (Chocolate Hazelnut)  (retail_price £2.99)
--   source: https://www.bulk.com/uk/products/macro-munch-protein-bar-v2/mmun-pbar-v2
UPDATE public.products SET servings_per_container = 1, serving_size = 62 WHERE id = 'd9f73f59-0366-4949-99e8-2ea520b1c8d7';

-- Supplement Needs — Advanced Liver Support  (retail_price £44.99)
--   source: https://www.supplementneeds.co.uk/products/supplement-needs-advanced-liver-support-stack
UPDATE public.products SET servings_per_container = 30, serving_size = 3, serving_unit = 'capsule' WHERE id = '810b5c13-062e-4c50-9033-0fdda083c3b1';

-- TrainedByJP — Vital Support  (retail_price £39.99)
--   source: https://www.tb-jp.com/products/vital-support
--   source: https://www.proteinpickandmix.co.uk/tbjp-vital-support-30-servings/
UPDATE public.products SET servings_per_container = 30, serving_size = 8, serving_unit = 'capsule' WHERE id = '76a1cbdd-a296-4c79-95ef-475c9b56cc88';

-- TBJP — JP Creatine  (retail_price £12.99)
--   source: https://www.tb-jp.com/products/creatine
UPDATE public.products SET servings_per_container = 60, serving_size = 5 WHERE id = '729856c9-4477-4d37-8dda-386071633bd1';

-- Supplement Needs — Probiotics 50 Billion CFU  (retail_price £24.99)
--   source: https://www.supplementneeds.co.uk/products/supplement-needs-probiotics-50-billion-cfus
UPDATE public.products SET servings_per_container = 60, serving_size = 1, serving_unit = 'capsule' WHERE id = 'ee7f4abb-fa9b-4e2f-ad9c-eb4c24570a02';

-- Supplement Needs — Sleep Stack  (retail_price £44.99)
--   source: https://www.supplementneeds.co.uk/products/supplement-needs-sleep-stack-2-month-supply
UPDATE public.products SET servings_per_container = 60, serving_size = 2, serving_unit = 'capsule' WHERE id = '6f3b5591-fc9f-45a3-b731-b9f9c2046e1a';

-- Nutrition Geeks — Pure Creatine Monohydrate Powder  (retail_price £9.99)
--   source: https://www.nutritiongeeks.co/products/pure-creatine-monohydrate
UPDATE public.products SET servings_per_container = 90, serving_size = 3.5 WHERE id = '99e438ca-067d-40c5-81f7-f1a26827551a';

-- MyProtein — Impact Creatine  (retail_price £15)
--   source: https://www.myprotein.com/p/sports-nutrition/creatine-monohydrate-powder/10530050/
UPDATE public.products SET servings_per_container = 147, serving_size = 3.4 WHERE id = 'd1660e89-00db-4abc-bb9f-190c81b617c4';

-- Supplement Needs — Creatine Monohydrate  (retail_price £19.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-creatine-monohydrate-500g
UPDATE public.products SET servings_per_container = 100, serving_size = 5 WHERE id = '072adf9d-2393-4f98-b433-5939929c7c9f';

-- Applied Nutrition — Creatine Monohydrate  (retail_price £18.95)
--   source: https://appliednutrition.uk/products/creatine-monohydrate
--   source: https://www.10reps.co.uk/product/applied-nutrition-creatine-monohydrate/
--   source: https://www.dolphinfitness.co.uk/en/applied-nutrition-creatine-monohydrate-500g/95083
UPDATE public.products SET servings_per_container = 100, serving_size = 5 WHERE id = 'c8c43264-f973-49a6-87c6-845123603583';

-- Darkstims — Creatine Monohydrate  (retail_price £18)
--   source: https://darkstims.com/products/darkstims-creatine
--   source: https://bodyshocker.co.uk/brand/darkstims/
UPDATE public.products SET servings_per_container = 100, serving_size = 5 WHERE id = '1b11e65b-cdff-4d12-835a-4c9c5ab9bac8';

-- Warrior — Creatine Monohydrate  (retail_price £14.99)
--   source: https://teamwarrior.com/products/warrior-creatine-monohydrate-powder-500g
--   source: https://www.dolphinfitness.co.uk/en/warrior-creatine-monohydrate-500g/457856
UPDATE public.products SET servings_per_container = 100, serving_size = 5 WHERE id = '7f5f3751-0e82-463b-8554-6d82cf487eba';

-- Barebells — Protein Bar (Cookies & Cream)  (retail_price £2.3)
--   source: https://barebells.co.uk/product/barebells-cookies-and-cream/
UPDATE public.products SET servings_per_container = 1, serving_size = 55 WHERE id = '9bd730b4-56ca-4545-bb05-69ed6d48ffb9';

-- Strom Sports Nutrition — ZMAX  (retail_price £24)
--   source: https://stromsports.com/products/strom-zmax-45-servings
UPDATE public.products SET servings_per_container = 45, serving_size = 2, serving_unit = 'capsule' WHERE id = 'aae3c686-cf5a-4ebb-91b4-4c8865b2e6fa';

-- Applied Nutrition — Protein Crunch Bar (Chocolate Caramel)  (retail_price £2)
--   source: https://appliednutrition.uk/products/protein-crunch-bar-62grams
UPDATE public.products SET servings_per_container = 1, serving_size = 62 WHERE id = 'a925a399-982a-4155-89d5-aee874046618';

-- USN — Trust Crunch (Chocolate Peanut)  (retail_price £1.8)
--   source: https://uk.usn.global/products/trust-crunch-bar-raspberry-cheese-cake-flavour-low-calorie-high-protein-snack-12-x-60g
--   source: https://proteinparcel.co.uk/products/usn-trust-crunch-salted-peanut-caramel-protein-bar
UPDATE public.products SET servings_per_container = 1, serving_size = 60 WHERE id = '163558b4-1ec5-4546-835d-435f42a88dc8';

-- Supplement Needs — Advanced Vitamin B Complex  (retail_price £16.99)
--   source: https://www.supplementneeds.co.uk/products/supplement-needs-advanced-vitamin-b-complex-60-capsules
--   source: https://www.supplementneeds.co.uk/products/supplement-needs-advanced-vitamin-b-complex-60-capsules (page title: '120 Tabs')
UPDATE public.products SET servings_per_container = 120, serving_size = 1, serving_unit = 'tablet' WHERE id = 'ab085248-f854-4b93-89f1-574467e8153e';

-- Supplement Needs — Multi Vitamin and Mineral PRO  (retail_price £14.99)
--   source: https://www.supplementneeds.co.uk/products/supplement-needs-multi-vitamin-and-mineral-pro
--   source: https://livewellsyndicate.com/product/supplement-needs-multi-vitamin-and-mineral-pro-30-or-60-capsules/
UPDATE public.products SET servings_per_container = 30, serving_size = 1, serving_unit = 'capsule' WHERE id = 'c3bc42b5-d5c0-404a-8805-7781ad4605fd';

-- Supplement Needs — Omega 3 High Strength  (retail_price £16.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-omega-3-high-strength-90-softgels
UPDATE public.products SET servings_per_container = 90, serving_size = 1, serving_unit = 'softgel' WHERE id = 'edb28a42-dc88-4628-8387-793f3ad00e95';

-- Supplement Needs — Greens+  (retail_price £34.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-greens-330g
UPDATE public.products SET servings_per_container = 30, serving_size = 11, serving_unit = 'g' WHERE id = 'e1455253-fb1b-4bbd-a3ff-8116bf97924b';

-- Supplement Needs — Vitamin C Powder  (retail_price £14.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-vitamin-c-powder-300g
UPDATE public.products SET servings_per_container = 60, serving_size = 5, serving_unit = 'g' WHERE id = 'e18459a8-325f-4766-b11c-ee598c6a9795';

-- Supplement Needs — Vitamin K2 (MK-4)  (retail_price £6.99)
--   source: https://supplementneeds.co.uk/products/supplement-needs-vitamin-k2-mk-4-120-tablets
UPDATE public.products SET servings_per_container = 120, serving_size = 1, serving_unit = 'tablet' WHERE id = 'ffcbc554-e00d-4738-be16-69599490d11f';

-- SuperDosed — Tongkat Ali  (retail_price £25)
--   source: https://superdosed.co.uk/products/tongkat-ali-superdosed
--   source: https://superdosed.co.uk/products/tongkat-ali-superdosed.json
UPDATE public.products SET servings_per_container = 30, serving_size = 1, serving_unit = 'capsule' WHERE id = '68546f63-f123-4e1f-8f46-46802b77de52';

-- Fulfil Nutrition — Vitamin & Protein Bar (Dark Choc Salted Caramel)  (retail_price £2.3)
--   source: https://fulfilnutrition.com/products/dark-chocolate-salted-caramel
UPDATE public.products SET servings_per_container = 1, serving_size = 55 WHERE id = '17218104-2c4d-4c5b-864d-846427626503';

-- Trek — Protein Flapjack (Cocoa Oat)  (retail_price £1.2)
--   source: https://www.musclefood.com/products/trek-oat-protein-flapjack-cocoa-1-x-50g
--   source: https://www.amazon.co.uk/Trek-Cocoa-Oat-Protein-Flapjack/dp/B00DW586NS
UPDATE public.products SET servings_per_container = 1, serving_size = 50 WHERE id = '0a327a09-db76-483e-88ca-b55aacf3d53f';

-- Huel — Ready-to-drink (Vanilla)  (retail_price £3.5)
--   source: https://uk.huel.com/products/huel-ready-to-drink/vanilla
--   source: https://www.amazon.co.uk/HUEL-Ready-Drink-Chocolate-Strawberries/dp/B0CK88YSM4
UPDATE public.products SET servings_per_container = 1, serving_size = 500 WHERE id = '51111a7f-f338-4e4d-819e-edce85a3b0a1';

-- Huel — Black Edition Ready-to-drink (Chocolate)  (retail_price £3.75)
--   source: https://uk.huel.com/products/huel-black-edition-ready-to-drink/chocolate
--   source: https://www.amazon.co.uk/HUEL-Ready-Drink-Chocolate-Strawberries/dp/B0CK88YSM4
UPDATE public.products SET servings_per_container = 1, serving_size = 500 WHERE id = '7aaebbcb-ac24-4b5f-9156-8f83cfc322b1';

-- Huel — Lite Ready-to-drink (Chocolate)  (retail_price £3.5)
--   source: https://uk.huel.com/products/huel-lite-ready-to-drink
--   source: https://www.sportsdirect.com/huel-huel-lite-ready-to-drink-20g-8-x-500ml-390319
UPDATE public.products SET servings_per_container = 1, serving_size = 500 WHERE id = '588ea7df-6140-4f46-9a08-3cdd7ffc1536';

-- Saturo — Meal Replacement Drink (Chocolate)  (retail_price £3.3)
--   source: https://saturo.com/en-gb/products/ready-to-drink-meal
--   source: https://saturo.com/en-us/products/ready-to-drink-meal
UPDATE public.products SET servings_per_container = 1, serving_size = 400 WHERE id = '3457e148-ef53-4197-b48b-33b5d961078b';

-- Jimmy Joy — Plenny Drink (Vanilla)  (retail_price £2.8)
--   source: https://jimmyjoy.com/en-gb/products/plenny-drink
--   source: https://world.openfoodfacts.org/product/8720165350087/plenny-drink-chocolate-v2-0-jimmy-joy
UPDATE public.products SET servings_per_container = 1, serving_size = 330 WHERE id = '8b197150-797e-4590-abb3-19b6b395e174';

-- Roar Ambition — TestoFuel  (retail_price £39.99)
--   source: https://www.testofuel.com/en-gb/testofuel-1-month
--   source: https://www.testofuel.com/en-gb/faq
--   source: https://www.onbuy.com/gb/p/testofuel-120-t-booster-pills-100-natural-uk-made-supplement~p50201672/
UPDATE public.products SET servings_per_container = 30, serving_size = 4, serving_unit = 'capsule' WHERE id = 'e309e1fa-5f75-44a7-9c0c-06d485622ea8';

-- Roar Ambition — Prime Male  (retail_price £59)
--   source: https://www.primemale.com/en-gb/primemale-1-month
--   source: https://www.amazon.com/Prime-Natural-Testosterone-Booster-Capsules/dp/B08VP1YMHW
UPDATE public.products SET servings_per_container = 30, serving_size = 4, serving_unit = 'capsule' WHERE id = '1e297da8-80ab-4aff-b196-1d3be6cd845e';

-- Hunter Evolve — Hunter Test  (retail_price £75)
--   source: https://www.hunterevolve.com/en-gb/hunter-test
UPDATE public.products SET servings_per_container = 30, serving_size = 6, serving_unit = 'capsule' WHERE id = '77daff05-5644-40a0-882e-4b197790bf50';

-- ============================================================
-- B. image_url — Bulk products
--    Source: scripts/update-images.sql (Awin product feed + bulk.com, 2026-06-13).
--    Each URL re-fetched 2026-08-22: HTTP 200, image/* content-type.
--    Keyed by id (resolved from the brand+name in the source file against the live snapshot).
--    "High Protein Bar" deliberately omitted: the source file re-used the Macro Munch image for it.
-- ============================================================
-- Bulk — Creatine Monohydrate
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/C/r/Creatine_Monohydrate_Yellow_EU_0fbf.jpg' WHERE id = 'f311ed1d-0f55-44f5-8953-c35d84e6b5ae' AND image_url IS NULL;

-- Bulk — Pure Whey Protein
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/P/U/PURE_WHEY_23G_FOP_THUMBNAIL_IMAGE_c443.png' WHERE id = '69978587-1083-4918-9317-18154e60e7f1' AND image_url IS NULL;

-- Bulk — Aftermath
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPPS_AMAT_1c97.png' WHERE id = '4b12a70e-fcd6-4031-aed7-d4d3f24d1712' AND image_url IS NULL;

-- Bulk — Electrolyte Powder
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_ELEC_0000_Thumbnail_Image_2b30.png' WHERE id = '6d78db1d-1b56-4e4c-8cd0-c7ecdf696ead' AND image_url IS NULL;

-- Bulk — ZMA Zinc Magnesium
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_ZMA_810C_Thumbnail_Image_428f.png' WHERE id = '6796ca45-f01a-4573-a1cb-4e16e4dc2fa9' AND image_url IS NULL;

-- Bulk — Magnesium Bisglycinate
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_MAGB_500T_Thumbnail_Image_df80.png' WHERE id = '04cd9fc1-86e5-4ceb-a5ef-7229f15ee4dc' AND image_url IS NULL;

-- Bulk — Omega-3 Fish Oil
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPB_O3SS_1000_Thumbnail_Image_31c5.png' WHERE id = '1856438d-d5cd-4151-97d5-f5cc379eab80' AND image_url IS NULL;

-- Bulk — Complete Multivitamin Complex
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/B/BBLE_CMVC_POWD_Thumbnail_Image_576b.png' WHERE id = '228c6fa7-7775-4e0f-bffa-c229a9503c1b' AND image_url IS NULL;

-- Bulk — Macro Munch (Chocolate Hazelnut)
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/M/M/MMUN_PBAR_CHAZ_BX12_Thumbnail_Image_b927.png' WHERE id = 'd9f73f59-0366-4949-99e8-2ea520b1c8d7' AND image_url IS NULL;

-- Bulk — Protein Cookie
UPDATE public.products SET image_url = 'https://www.bulk.com/media/catalog/product/B/P/BPF_HPCO_WCRA_BX12_Thumbnail_Image_843e.png' WHERE id = '2b640b72-29de-4998-9aa7-3adaadeca813' AND image_url IS NULL;

-- ============================================================
-- C. buy_url — gap-fills and Awin re-wraps
--    Source: scripts/backfill-buy-urls-amazon-2026-08-03.sql. Its header: every ASIN was found
--    via search, then confirmed by loading amazon.co.uk/dp/<ASIN> and reading the live title,
--    price and stock. Re-fetched 2026-08-22: HTTP 200. Affiliate tag theliftinglab-21 unchanged;
--    Awin awinmid=4822 / awinaffid=2919631 unchanged.
-- ============================================================
-- Bulk — Creatine Monohydrate  (current: https://www.bulk.com/uk/products/creatine-monohydrate/bpb-cmon-0000)
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fcreatine-monohydrate%2Fbpb-cmon-0000' WHERE id = 'f311ed1d-0f55-44f5-8953-c35d84e6b5ae';

-- Bulk — Pure Whey Isolate  (current: https://www.bulk.com/uk/products/pure-whey-isolate-90/bpb-wpi9-0000)
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fpure-whey-isolate-90%2Fbpb-wpi9-0000' WHERE id = '2429dd22-45c3-4088-acf3-4148782bcb00';

-- Per4m — Advanced Whey  (current: NULL)
UPDATE public.products SET buy_url = 'https://www.amazon.co.uk/dp/B0DR3JZX8S?tag=theliftinglab-21' WHERE id = '7cb28341-5b19-4a0b-b49c-e77bb27182c4';

-- USN — BlueLab 100% Whey  (current: NULL)
UPDATE public.products SET buy_url = 'https://www.amazon.co.uk/dp/B07DMCB82S?tag=theliftinglab-21' WHERE id = '767210a6-f16f-48f1-bc45-dc7bc41dc302';

-- ============================================================
-- D. buy_url — dead-link repairs
--    Source: scripts/fix-broken-buy-urls-2026-08-14.sql (full outbound-link audit; each
--    replacement fetched and confirmed HTTP 200 with the correct product <h1>).
-- ============================================================
-- Applied Nutrition — ABE (All Black Everything)  (current: https://www.gymstop.co.uk/products/applied-nutrition-abe-all-black-everything)
UPDATE public.products SET buy_url = 'https://appliednutrition.uk/products/abe-all-black-everything-375g' WHERE id = 'c0f8dde0-6555-4449-9877-3c7ccd410339';

-- Bio-Synergy — Whey Hey®  (current: https://bio-synergy.uk/products/bio-synergy-whey-hey)
UPDATE public.products SET buy_url = 'https://bio-synergy.uk/products/bio-synergy-whey-hey%C2%AE' WHERE id = 'f42a7d2f-f236-48bc-8dc3-38a2b803dad8';

-- CNP Professional — CNP EAA  (current: https://cnpprofessional.co.uk/products/loaded-eaa-fantasy-series-orange)
UPDATE public.products SET buy_url = 'https://cnpprofessional.co.uk/products/loaded-eaa' WHERE id = 'a3483e0b-65f4-4b68-b2aa-0a81efbbb800';

-- CNP Professional — Pro Recover  (current: https://cnpprofessional.co.uk/products/recover-1-28kg-16-servings-strawberry)
UPDATE public.products SET buy_url = 'https://cnpprofessional.co.uk/products/pro-recover' WHERE id = '24250aa6-3786-4a36-8dfa-384cba90ed01';

-- Reflex Nutrition — One Stop Xtreme  (current: https://reflexnutrition.com/products/one-stop®-xtreme-short-dated)
UPDATE public.products SET buy_url = 'https://reflexnutrition.com/products/one-stop-xtreme' WHERE id = 'abffbfcd-c048-4c70-9cb9-50798fd97d9f';

COMMIT;

-- ============================================================
-- E. NOT APPLIED — needs a human decision (left commented out on purpose)
-- ============================================================
-- [med] MyProtein — Creapure Creatine: spc=147, ss=3.4 g
--   why deferred: Official MyProtein page states serving 3.4g (=3g creatine). Page default size is 500g listed at £36.49 (RRP £39.99); Boots lists both 250g and 500g SKUs. The £25 row price is below the current sale price but MyProtein routinely discounts the 500g via codes; cur_spc=147 (=500/3.4) and the buy_url default both point to 500g, so reported as 500g = ~147 servings. Serving size cross-confirmed at 3.4g on two sources. Med because the £25 price does not cleanly map to a current advertised pack price (250g would be ~73 servings).
--   source: https://www.myprotein.com/p/sports-nutrition/the-creatine-creapure/10529740/
--   source: https://www.boots.com/myprotein-the-creatine-powder-creapure-500g-10376371
-- UPDATE public.products SET servings_per_container = 147, serving_size = 3.4, serving_unit = 'g' WHERE id = 'be251f51-6584-43fe-b9e8-9c7c80bb0d19';

-- [med] Bio-Synergy — Creatine Plus®: spc=93, ss=4 capsule
--   why deferred: The given buy_url pointed to the 125-capsule 'Strength' SKU (£21.99), but the £49.99 row price matches the larger 'Creatine Plus Phase 1 & 2' 375-capsule pack (official site confirms £49.99, 375 caps; Superdrug confirms 375 caps). Dosing is two-phase: loading 5 caps x5/day for 5 days, then maintenance 4 caps/day. servings_per_container reported on the maintenance dose: (375 - 125 loading caps) / 4 = ~93 maintenance servings; serving_size=4 capsules (maintenance). Med due to the unusual two-phase protocol and the buy_url pointing to a different (smaller) SKU than the price implies.
--   source: https://bio-synergy.uk/products/bio-synergy-creatine-plus%C2%AE-phase-1-2
--   source: https://www.superdrug.com/health/diet-fitness/pre-work-out-powder-supplements/bio-synergy-creatine-plus-phase-1-and-phase-2-375-capsules/p/mp-00103299
-- UPDATE public.products SET servings_per_container = 93, serving_size = 4, serving_unit = 'capsule' WHERE id = 'e70ad247-7a3e-4871-932e-8509b36a211b';

-- [med] Conteh Sports — Vitality: spc=30, ss=3 capsule
--   why deferred: NAME MISMATCH: Conteh Sports has no product named 'Vitality'. The only Conteh cycle-support/organ product is 'Organ Defence - Vital Organ Support' (note 'Vital' in subtitle - likely source of the 'Vitality' label). Two sources confirm Organ Defence = 90 capsules, 3 caps/serving, 30 servings, listed at GBP 39.99 (row price GBP 34.99, plausible retailer variation). Serving data confident; product-identity inference lowers confidence to med.
--   source: https://contehsports.com/products/organ-defence-vital-organ-support
--   source: https://nisupplements.com/products/conteh-sports-organ-defence-vital-organ-support
-- UPDATE public.products SET servings_per_container = 30, serving_size = 3, serving_unit = 'capsule' WHERE id = 'f7cc7239-ca28-47e2-93a9-0068c460da2c';

-- [med] SuperDosed — Magnesium Glycinate: spc=30, ss=2 capsule
--   why deferred: Official page confirms serving = 2 capsules daily (300mg elemental magnesium from 2,100mg magnesium glycinate). Total capsule count not explicitly stated on page or in product JSON. The £13 price matches the '1 Month' variant (variants: 1/2/3 Month at £13/£21/£28). At 2 caps/day for 1 month, container = 60 capsules / 30 servings. Servings_per_container derived from 1-month variant labelling + daily dose; no explicit count published, hence med confidence.
--   source: https://superdosed.co.uk/products/magnesium-glycinate-superdosed
--   source: https://superdosed.co.uk/products/magnesium-glycinate-superdosed.json
-- UPDATE public.products SET servings_per_container = 30, serving_size = 2, serving_unit = 'capsule' WHERE id = '8b95c03d-709f-466e-a80c-6b7a13688118';

-- [med] SuperDosed — Ashwagandha: spc=30, ss=1 capsule
--   why deferred: Official page confirms serving = 1 capsule daily (1,000mg ashwagandha extract, 50mg withanolides, + piperine). Total capsule count not explicitly stated on page or in product JSON. The £12 price matches the '1 Month' variant (variants: 1/2/3 Month at £12/£19/£25). At 1 cap/day for 1 month, container = 30 capsules / 30 servings. Derived from 1-month variant labelling + daily dose; no explicit count published, hence med confidence.
--   source: https://superdosed.co.uk/products/ashwaganda-superdosed
--   source: https://superdosed.co.uk/products/ashwaganda-superdosed.json
-- UPDATE public.products SET servings_per_container = 30, serving_size = 1, serving_unit = 'capsule' WHERE id = '2b3e6bc9-bac1-4ac5-9e97-dc657c9c86c4';

-- Liquid IV — Hydration Multiplier: Amazon listing is a 16-stick pack; DB row says 15 servings — pack may not match the priced SKU
-- UPDATE public.products SET buy_url = 'https://www.amazon.co.uk/dp/B0F8HHM1XM?tag=theliftinglab-21' WHERE id = '5e13c87a-1d35-4dd5-a141-43a281bef5e5';

-- Grenade — Pre-Workout: Amazon price £8.00 vs retail_price £24.99 — source file itself flags possible clearance / different size
-- UPDATE public.products SET buy_url = 'https://www.amazon.co.uk/dp/B0CKFJSQL1?tag=theliftinglab-21' WHERE id = '943638a7-3c67-4c92-900c-ab0bfa9d7a60';

-- Also deliberately NOT included (see PR description): Darkstims Ultra servings 2→20 (no source URL);
-- replace-discontinued-products.sql images (coupled to product renames + price changes);
-- backfill-servings-2026-08-17.sql (generated from _servings-research.json which has no sources and
-- self-describes values as 'assumed'); fix-units-discontinued-2026-08-17.sql (delists 2 products —
-- business decision); any nutrient rows (no sourced data exists for the 25 products missing them).
