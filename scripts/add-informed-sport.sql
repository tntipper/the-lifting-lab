-- Add informed_sport column and flag certified Bulk products
-- Run in Supabase SQL Editor

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS informed_sport boolean DEFAULT false;

-- Flag Bulk Informed Sport certified products
UPDATE public.products SET informed_sport = true
WHERE brand = 'Bulk' AND name IN (
  'Creatine Monohydrate',
  'Pure Whey Protein',
  'Pure Whey Isolate',
  'Micellar Casein',
  'Complete EAA',
  'Complete Intra-Workout',
  'Omega-3 Fish Oil',
  'Vitamin D3 4000IU',
  'Complete Multivitamin Complex',
  'High Protein Bar',
  'Vegan Protein Bar',
  'Macro Munch (Chocolate Hazelnut)',
  'ZMA Zinc Magnesium'
);
