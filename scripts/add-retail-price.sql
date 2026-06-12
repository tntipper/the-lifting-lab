-- Add retail_price column to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS retail_price numeric(8,2);

-- Seed approximate UK retail prices for common products
-- Prices are average UK RRP as of June 2026; update via weekly job
UPDATE public.products SET retail_price = 24.99 WHERE brand = 'Bulk' AND name = 'Creatine Monohydrate';
UPDATE public.products SET retail_price = 27.99 WHERE brand = 'Bulk' AND name = 'Creapure';
UPDATE public.products SET retail_price = 32.99 WHERE brand = 'Bulk' AND name = 'Complete EAA';
UPDATE public.products SET retail_price = 27.99 WHERE brand = 'Bulk' AND name = 'Complete Intra-Workout';
UPDATE public.products SET retail_price = 34.99 WHERE brand = 'Bulk' AND name = 'Aftermath';
UPDATE public.products SET retail_price = 12.99 WHERE brand = 'Bulk' AND name = 'Electrolyte Powder';
UPDATE public.products SET retail_price = 29.99 WHERE brand = 'Bulk' AND name = 'Pure Whey Protein';
UPDATE public.products SET retail_price = 34.99 WHERE brand = 'Bulk' AND name = 'Pure Whey Isolate';
UPDATE public.products SET retail_price = 34.99 WHERE brand = 'Bulk' AND name = 'Micellar Casein';
UPDATE public.products SET retail_price = 2.99  WHERE brand = 'Bulk' AND name = 'Macro Munch (Chocolate Hazelnut)';
UPDATE public.products SET retail_price = 9.99  WHERE brand = 'Bulk' AND name = 'ZMA Zinc Magnesium';
UPDATE public.products SET retail_price = 14.99 WHERE brand = 'Bulk' AND name = 'CoQ10 200mg';
UPDATE public.products SET retail_price = 14.99 WHERE brand = 'Bulk' AND name = 'Vitamin D3 & K2';
UPDATE public.products SET retail_price = 12.99 WHERE brand = 'Bulk' AND name = 'Plant Sterols';
UPDATE public.products SET retail_price = 12.99 WHERE brand = 'Bulk' AND name = 'Milk Thistle Extract 5000mg';
UPDATE public.products SET retail_price = 17.99 WHERE brand = 'Bulk' AND name = 'NAC N-Acetyl Cysteine';
UPDATE public.products SET retail_price = 14.99 WHERE brand = 'Bulk' AND name = 'Alpha Lipoic Acid 300mg';
UPDATE public.products SET retail_price = 14.99 WHERE brand = 'Bulk' AND name = 'Omega-3 Fish Oil';
UPDATE public.products SET retail_price = 9.99  WHERE brand = 'Bulk' AND name = 'Vitamin C 1000mg';
UPDATE public.products SET retail_price = 14.99 WHERE brand = 'Bulk' AND name = 'Magnesium Bisglycinate';
UPDATE public.products SET retail_price = 9.99  WHERE brand = 'Bulk' AND name = 'Vitamin D3 4000IU';
UPDATE public.products SET retail_price = 17.99 WHERE brand = 'Bulk' AND name = 'Complete Multivitamin Complex';
UPDATE public.products SET retail_price = 19.99 WHERE brand = 'Bulk' AND name = 'Glucosamine & Chondroitin';
UPDATE public.products SET retail_price = 19.99 WHERE brand = 'Bulk' AND name = 'Complete Sleep';
UPDATE public.products SET retail_price = 2.49  WHERE brand = 'Bulk' AND name = 'High Protein Bar';
UPDATE public.products SET retail_price = 2.49  WHERE brand = 'Bulk' AND name = 'Vegan Protein Bar';
UPDATE public.products SET retail_price = 2.79  WHERE brand = 'Bulk' AND name = 'Protein Cookie';
