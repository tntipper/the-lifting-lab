-- Bulk protein bars
-- Run in Supabase SQL Editor

-- Reclassify Macro Munch from meal-replacement to protein-bar
UPDATE public.products
SET category = 'protein-bar'
WHERE brand = 'Bulk' AND name = 'Macro Munch (Chocolate Hazelnut)';

-- High Protein Bar (whey-based)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('High Protein Bar', 'Bulk', 'protein-bar', 55, 'g', 12, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Protein', 20, 'g'),
  ('Calories', 195, 'kcal'),
  ('Carbohydrates', 18, 'g'),
  ('Sugar', 3, 'g'),
  ('Fat', 6, 'g'),
  ('Saturated Fat', 3, 'g'),
  ('Fibre', 3, 'g')
) AS n(name, amount, unit);

-- Vegan Protein Bar
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Vegan Protein Bar', 'Bulk', 'protein-bar', 60, 'g', 12, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Protein', 20, 'g'),
  ('Calories', 210, 'kcal'),
  ('Carbohydrates', 20, 'g'),
  ('Sugar', 4, 'g'),
  ('Fat', 7, 'g'),
  ('Saturated Fat', 2, 'g'),
  ('Fibre', 4, 'g')
) AS n(name, amount, unit);

-- Protein Cookie
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Protein Cookie', 'Bulk', 'protein-bar', 60, 'g', 12, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Protein', 15, 'g'),
  ('Calories', 225, 'kcal'),
  ('Carbohydrates', 25, 'g'),
  ('Sugar', 5, 'g'),
  ('Fat', 8, 'g'),
  ('Saturated Fat', 4, 'g'),
  ('Fibre', 3, 'g')
) AS n(name, amount, unit);
