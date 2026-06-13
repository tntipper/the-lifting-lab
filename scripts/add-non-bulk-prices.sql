-- Adds retail_price for non-Bulk products already seeded in the products table.
-- Prices are approximate UK retail (correct as of Jun 2026) — update as needed.
-- Run in Supabase SQL Editor after add-retail-price.sql (which creates the column).

UPDATE public.products
SET retail_price = 54.99
WHERE brand = 'Optimum Nutrition' AND name = 'Gold Standard 100% Whey';

UPDATE public.products
SET retail_price = 24.99
WHERE brand = 'Applied Nutrition' AND name = 'ABE All Black Everything Pre-Workout';

UPDATE public.products
SET retail_price = 9.99
WHERE brand = 'MyProtein' AND name = 'Complete Daily Multivitamin';

UPDATE public.products
SET retail_price = 9.95
WHERE brand = 'BetterYou' AND name = 'Vitamin D3 4000 IU Spray';

-- Grenade Carb Killa (box of 12 bars)
UPDATE public.products
SET retail_price = 22.99
WHERE brand = 'Grenade' AND category = 'protein-bar';
