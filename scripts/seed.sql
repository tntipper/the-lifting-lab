-- Run in Supabase SQL Editor to seed demo products
-- The Lifting Lab — 5 demo products with nutrients

-- Whey
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Gold Standard 100% Whey', 'Optimum Nutrition', 'whey', 30.4, 'g', 74, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Protein', 24, 'g'),
  ('Calories', 120, 'kcal'),
  ('Carbohydrates', 3, 'g'),
  ('Fat', 1.5, 'g')
) AS n(name, amount, unit);

-- Pre-Workout
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('ABE All Black Everything Pre-Workout', 'Applied Nutrition', 'pre-workout', 15, 'g', 30, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Caffeine', 200, 'mg'),
  ('Vitamin B6', 5, 'mg'),
  ('Citrulline Malate', 4000, 'mg'),
  ('Beta-Alanine', 1600, 'mg')
) AS n(name, amount, unit);

-- Multivitamin
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Complete Daily Multivitamin', 'MyProtein', 'multivitamin', 1, 'tablet', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Vitamin A', 800, 'mcg'),
  ('Vitamin C', 80, 'mg'),
  ('Vitamin D3', 5, 'mcg'),
  ('Vitamin B6', 1.4, 'mg'),
  ('Zinc', 10, 'mg'),
  ('Magnesium', 100, 'mg'),
  ('Iron', 14, 'mg'),
  ('Selenium', 55, 'mcg')
) AS n(name, amount, unit);

-- Vitamin D3
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Vitamin D3 4000 IU Spray', 'BetterYou', 'vitamin-d', 1, 'spray', 100, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Vitamin D3', 100, 'mcg')
) AS n(name, amount, unit);

-- ZMA
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('ZMA Zinc Magnesium', 'Bulk', 'zma', 3, 'capsule', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Zinc', 15, 'mg'),
  ('Magnesium', 250, 'mg'),
  ('Vitamin B6', 10, 'mg')
) AS n(name, amount, unit);
