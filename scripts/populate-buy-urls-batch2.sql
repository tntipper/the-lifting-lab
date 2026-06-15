-- populate-buy-urls-batch2.sql
-- Pre-launch data-quality pass #2: newly-resolved DIRECT product-page URLs.
-- Every URL was fetch-verified (brand own-store) or WebSearch-confirmed live (Bulk).
-- Bulk links are Awin deeplinks (awinmid=4822, awinaffid=2919631) per lib/affiliate.ts.
-- Brand-store links are bare (those brands have no affiliate program wired).
-- Idempotent. Run in Supabase SQL Editor AFTER add-buy-url.sql + populate-buy-urls.sql.

UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/platinum-pre-workout-powder' WHERE brand = 'Optimum Nutrition' AND name = 'Platinum Pre-Workout';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/micronised-creatine-powder' WHERE brand = 'Optimum Nutrition' AND name = 'Micronised Creatine Powder';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/platinum-creatine-plus-powder' WHERE brand = 'Optimum Nutrition' AND name = 'Platinum Creatine Plus';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/essential-amino-energy-powder' WHERE brand = 'Optimum Nutrition' AND name = 'Essential Amino Energy';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/essential-amino-energy-elite' WHERE brand = 'Optimum Nutrition' AND name = 'Essential Amino Energy Elite';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/serious-mass-weight-gainer-protein-powder-eu' WHERE brand = 'Optimum Nutrition' AND name = 'Serious Mass';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/electrolyte-powder' WHERE brand = 'Optimum Nutrition' AND name = 'Electrolyte Powder';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/gold-standard-100-isolate-whey-protein-powder-eu' WHERE brand = 'Optimum Nutrition' AND name = 'Gold Standard 100% Isolate';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/platinum-hydrowhey-hydrolysed-whey-protein-powder-eu' WHERE brand = 'Optimum Nutrition' AND name = 'Platinum Hydrowhey';
UPDATE public.products SET buy_url = 'https://www.optimumnutrition.com/en-gb/products/gold-standard-100-casein-protein-powder-eu' WHERE brand = 'Optimum Nutrition' AND name = 'Gold Standard 100% Casein';
UPDATE public.products SET buy_url = 'https://www.theformula.shop/products/neuphoric' WHERE brand = 'The Formula' AND name = 'NEUPHORIC';
UPDATE public.products SET buy_url = 'https://jymsupplementscience.com/products/pre-jym-preworkout' WHERE brand = 'JYM Supplement Science' AND name = 'Pre JYM';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/origin-pre-workout/12941037/' WHERE brand = 'MyProtein' AND name = 'Origin Pre-Workout';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/origin-pre-workout-pump-stim-free/14269805/' WHERE brand = 'MyProtein' AND name = 'Origin Pump Pre-Workout | Stim & Caffeine-Free';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/impact-eaa/11985042/' WHERE brand = 'MyProtein' AND name = 'Impact EAA';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/impact-whey-isolate-powder/10530911/' WHERE brand = 'MyProtein' AND name = 'Impact Whey Isolate';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/micellar-casein-batch-tested-range/10872832/' WHERE brand = 'MyProtein' AND name = 'Micellar Casein';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/vitamins/prebiotic-inulin-fibre/11397387/' WHERE brand = 'MyProtein' AND name = 'Prebiotic Inulin Fibre Powder';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/the-creatine-creapure/10529740/' WHERE brand = 'MyProtein' AND name = 'Creapure Creatine';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/impact-hydrate/15494789/' WHERE brand = 'MyProtein' AND name = 'Impact Hydration';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/clear-whey-isolate/12095867/' WHERE brand = 'MyProtein' AND name = 'Clear Whey Isolate';
UPDATE public.products SET buy_url = 'https://www.myprotein.com/p/sports-nutrition/crispy-layered-protein-bar/12856629/' WHERE brand = 'Myprotein' AND name = 'Crispy Layered Bar (White Chocolate Peanut)';
UPDATE public.products SET buy_url = 'https://bio-synergy.uk/product/bio-synergy-creatine-plus-strength/' WHERE brand = 'Bio-Synergy' AND name = 'Creatine Plus®';
UPDATE public.products SET buy_url = 'https://bio-synergy.uk/products/bio-synergy-whey-hey' WHERE brand = 'Bio-Synergy' AND name = 'Whey Hey®';
UPDATE public.products SET buy_url = 'https://bio-synergy.uk/products/bio-synergy-whey-better' WHERE brand = 'Bio-Synergy' AND name = 'Whey Better®';
UPDATE public.products SET buy_url = 'https://bio-synergy.uk/products/bio-synergy-afterdark-protein' WHERE brand = 'Bio-Synergy' AND name = 'After Dark Protein';
UPDATE public.products SET buy_url = 'https://teamwarrior.com/products/warrior-rage-pre-workout-powder' WHERE brand = 'Warrior' AND name = 'Rage';
UPDATE public.products SET buy_url = 'https://teamwarrior.com/products/warrior-whey-protein-1kg' WHERE brand = 'Warrior' AND name = 'Whey Protein';
UPDATE public.products SET buy_url = 'https://teamwarrior.com/products/warrior-clear-whey-protein-isolate-powder-375g' WHERE brand = 'Warrior' AND name = 'Clear Whey Isolate';
UPDATE public.products SET buy_url = 'https://teamwarrior.com/products/warrior-crunch-protein-bars-12s' WHERE brand = 'Warrior' AND name = 'Crunch Protein Bar';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fcreapure-creatine-monohydrate%2Fbpb-crea-0000' WHERE brand = 'Bulk' AND name = 'Creapure';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Faftermath%2Fbpps-amat' WHERE brand = 'Bulk' AND name = 'Aftermath';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Felectrolyte-powder%2Fbpb-elec-0000' WHERE brand = 'Bulk' AND name = 'Electrolyte Powder';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fpure-whey-protein%2Fbpb-wpc8-0000' WHERE brand = 'Bulk' AND name = 'Pure Whey Protein';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fmicellar-casein%2Fbpb-mpi9-0000' WHERE brand = 'Bulk' AND name = 'Micellar Casein';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fmacro-munch-protein-bar-v2%2Fmmun-pbar-v2' WHERE brand = 'Bulk' AND name = 'Macro Munch (Chocolate Hazelnut)';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fzma-capsules%2Fbpb-zma-0000' WHERE brand = 'Bulk' AND name = 'ZMA';
UPDATE public.products SET buy_url = 'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fpsyllium-husks-powder%2Fbpb-phus-0000' WHERE brand = 'Bulk' AND name = 'Psyllium Husk Powder';
UPDATE public.products SET buy_url = 'https://www.stromsports.com/products/strom-presents-creamax-with-patented-creapure' WHERE brand = 'Strom Sports Nutrition' AND name = 'Creapure';
UPDATE public.products SET buy_url = 'https://www.stromsports.com/products/strom-presents-supportmax' WHERE brand = 'Strom Sports Nutrition' AND name = 'SupportMAX';
UPDATE public.products SET buy_url = 'https://www.grenade.com/products/protein-bar-chocolate-salted-caramel' WHERE brand = 'Grenade' AND name = 'Carb Killa (Chocolate Chip Salted Caramel)';
UPDATE public.products SET buy_url = 'https://www.phd.com/phd-smart-bar-cookies-cream-12-x-64g' WHERE brand = 'PhD Nutrition' AND name = 'Smart Bar (Cookies & Cream)';
UPDATE public.products SET buy_url = 'https://naughtyboylifestyle.com/products/naughty-boy-menace-pre-workout' WHERE brand = 'Naughty Boy' AND name = 'Menace';
UPDATE public.products SET buy_url = 'https://naughtyboylifestyle.com/products/naughty-boy-amino-eaa' WHERE brand = 'Naughty Boy' AND name = 'Amino';
UPDATE public.products SET buy_url = 'https://naughtyboylifestyle.com/products/naughty-boy-prime-life-pac' WHERE brand = 'Naughty Boy' AND name = 'Life Pac / Life Support';
UPDATE public.products SET buy_url = 'https://www.tb-jp.com/products/prepare-pro' WHERE brand = 'TrainedByJP' AND name = 'Prepare';
UPDATE public.products SET buy_url = 'https://www.tb-jp.com/products/jp-eaa-1kg' WHERE brand = 'TrainedByJP' AND name = 'JP EAA';
UPDATE public.products SET buy_url = 'https://www.tb-jp.com/products/peak-hydration' WHERE brand = 'TrainedByJP' AND name = 'JP Hydration';
UPDATE public.products SET buy_url = 'https://www.tb-jp.com/products/vital-support' WHERE brand = 'TrainedByJP' AND name = 'Vital Support';
UPDATE public.products SET buy_url = 'https://www.tb-jp.com/products/creatine' WHERE brand = 'TBJP' AND name = 'JP Creatine';
UPDATE public.products SET buy_url = 'https://www.tb-jp.com/products/jp-whey-isopro-2kg' WHERE brand = 'Trained by JP (TBJP)' AND name = 'Iso-Pro';
UPDATE public.products SET buy_url = 'https://hr-labs.co.uk/products/hydro-eaa' WHERE brand = 'HR Labs' AND name = 'Hydro';
UPDATE public.products SET buy_url = 'https://www.supplementneeds.co.uk/products/supplement-needs-advanced-liver-support-stack' WHERE brand = 'Supplement Needs' AND name = 'Advanced Liver Support';
UPDATE public.products SET buy_url = 'https://www.supplementneeds.co.uk/products/supplement-needs-probiotics-50-billion-cfus' WHERE brand = 'Supplement Needs' AND name = 'Probiotics 50 Billion CFU';
UPDATE public.products SET buy_url = 'https://www.supplementneeds.co.uk/products/supplement-needs-sleep-stack-2-month-supply' WHERE brand = 'Supplement Needs' AND name = 'Sleep Stack';
UPDATE public.products SET buy_url = 'https://appliednutrition.uk/products/zma-pro' WHERE brand = 'Applied Nutrition' AND name = 'ZMA Pro';
UPDATE public.products SET buy_url = 'https://www.scienceinsport.com/rego-rapid-recovery-powder-1-5kg-strawberry' WHERE brand = 'Science in Sport (SiS)' AND name = 'REGO Rapid Recovery';
UPDATE public.products SET buy_url = 'https://www.scienceinsport.com/go-hydro-20-tablets-beere' WHERE brand = 'Science In Sport (SiS)' AND name = 'Go Hydro';
UPDATE public.products SET buy_url = 'https://uk.ghostlifestyle.com/products/ghost-hydration' WHERE brand = 'Ghost Lifestyle' AND name = 'Ghost Hydration';
UPDATE public.products SET buy_url = 'https://highfive.co.uk/products/zero' WHERE brand = 'High5' AND name = 'Zero';
UPDATE public.products SET buy_url = 'https://www.precisionhydration.com/products/ph-1000-low-calorie-electrolyte-supplement' WHERE brand = 'Precision Hydration' AND name = 'PH 1000';
UPDATE public.products SET buy_url = 'https://uk.ghostlifestyle.com/products/ghost-whey' WHERE brand = 'Ghost' AND name = 'Whey';
UPDATE public.products SET buy_url = 'https://www.theproteinworks.com/whey-protein-80-concentrate' WHERE brand = 'The Protein Works' AND name = 'Whey Protein 80';
UPDATE public.products SET buy_url = 'https://www.theproteinworks.com/casein-protein' WHERE brand = 'The Protein Works (TPW)' AND name = '100% Micellar Casein';
UPDATE public.products SET buy_url = 'https://barebells.co.uk/product/barebells-cookies-and-cream/' WHERE brand = 'Barebells' AND name = 'Protein Bar (Cookies & Cream)';
UPDATE public.products SET buy_url = 'https://fulfilnutrition.com/products/dark-chocolate-salted-caramel' WHERE brand = 'Fulfil Nutrition' AND name = 'Vitamin & Protein Bar (Dark Choc Salted Caramel)';
UPDATE public.products SET buy_url = 'https://www.trekbars.com/products/protein-flapjacks/protein-flapjacks-cocoa-oat/' WHERE brand = 'Trek' AND name = 'Protein Flapjack (Cocoa Oat)';
UPDATE public.products SET buy_url = 'https://uk.huel.com/products/huel-ready-to-drink/vanilla' WHERE brand = 'Huel' AND name = 'Ready-to-drink (Vanilla)';
UPDATE public.products SET buy_url = 'https://uk.huel.com/products/huel-black-edition-ready-to-drink/chocolate' WHERE brand = 'Huel' AND name = 'Black Edition Ready-to-drink (Chocolate)';
UPDATE public.products SET buy_url = 'https://uk.huel.com/products/huel-lite-ready-to-drink' WHERE brand = 'Huel' AND name = 'Lite Ready-to-drink (Chocolate)';
UPDATE public.products SET buy_url = 'https://saturo.com/en-gb/products/ready-to-drink-meal' WHERE brand = 'Saturo' AND name = 'Meal Replacement Drink (Chocolate)';
UPDATE public.products SET buy_url = 'https://jimmyjoy.com/en-gb/products/plenny-drink' WHERE brand = 'Jimmy Joy' AND name = 'Plenny Drink (Vanilla)';
UPDATE public.products SET buy_url = 'https://superdosed.co.uk/products/magnesium-glycinate-superdosed' WHERE brand = 'SuperDosed' AND name = 'Magnesium Glycinate';
UPDATE public.products SET buy_url = 'https://superdosed.co.uk/products/tongkat-ali-superdosed' WHERE brand = 'SuperDosed' AND name = 'Tongkat Ali';
UPDATE public.products SET buy_url = 'https://superdosed.co.uk/products/ashwaganda-superdosed' WHERE brand = 'SuperDosed' AND name = 'Ashwagandha';
UPDATE public.products SET buy_url = 'https://www.testofuel.com/en-gb/testofuel-1-month' WHERE brand = 'Roar Ambition' AND name = 'TestoFuel';
UPDATE public.products SET buy_url = 'https://www.primemale.com/en-gb/primemale-1-month' WHERE brand = 'Roar Ambition' AND name = 'Prime Male';
UPDATE public.products SET buy_url = 'https://www.hunterevolve.com/en-gb/hunter-test' WHERE brand = 'Hunter Evolve' AND name = 'Hunter Test';
UPDATE public.products SET buy_url = 'https://testogen.com/products/testogen' WHERE brand = 'MuscleClub Ltd' AND name = 'TestoGen';
UPDATE public.products SET buy_url = 'https://www.optibacprobiotics.com/uk/product/for-every-day-90-capsules' WHERE brand = 'Optibac' AND name = 'Probiotics for Every Day';
UPDATE public.products SET buy_url = 'https://www.optibacprobiotics.com/uk/product/for-every-day-extra-strength-90-capsules' WHERE brand = 'Optibac' AND name = 'Every Day EXTRA';
UPDATE public.products SET buy_url = 'https://www.optibacprobiotics.com/product/for-every-day-max-30-capsules' WHERE brand = 'Optibac' AND name = 'Every Day MAX';
UPDATE public.products SET buy_url = 'https://www.optibacprobiotics.com/product/bifidobacteria-fibre-30-sachets' WHERE brand = 'Optibac' AND name = 'Bifido & Fibre';
UPDATE public.products SET buy_url = 'https://www.bio-kult.com/p/everyday-gut/13412724/' WHERE brand = 'Bio-Kult' AND name = 'Everyday Gut (Original)';
UPDATE public.products SET buy_url = 'https://www.precisionbiotics.co.uk/p/alflorex-original-daily-gut-supplement-30-capsules/13444442/' WHERE brand = 'PrecisionBiotics' AND name = 'Alflorex';
UPDATE public.products SET buy_url = 'https://www.symprove.com/products/symprove-4-week-pack-original' WHERE brand = 'Symprove' AND name = 'Symprove Original';
UPDATE public.products SET buy_url = 'https://darklabs.pro/p/crack-og-40-servings/' WHERE brand = 'Dark Labs' AND name = 'Crack OG';

-- 87 direct URLs emitted.
