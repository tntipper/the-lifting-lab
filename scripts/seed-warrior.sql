-- seed-warrior.sql
-- Adds 4 current Warrior products to the DB
-- Run in Supabase SQL Editor

-- 1. Creatine Monohydrate (score: 96)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status, retail_price, image_url)
  VALUES ('Creatine Monohydrate', 'Warrior', 'creatine', 5, 'g', 100, 'tll_reviewed', 'active', 8.99,
    'https://cdn.shopify.com/s/files/1/0335/8726/5581/files/B347-U-1_2f71e9c4-baad-4ff2-824f-3dbfd3aaea33.jpg')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Creatine Monohydrate', 5000, 'mg')
) AS n(name, amount, unit);

-- 2. Whey Protein (score: 57)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status, retail_price, image_url)
  VALUES ('Whey Protein', 'Warrior', 'whey', 30, 'g', 16, 'tll_reviewed', 'active', 19.99,
    'https://cdn.shopify.com/s/files/1/0335/8726/5581/files/B201_WARRIOR_WHEY_PROTEIN_CB_500_2_0eb1aa1d-5f6c-4e3a-a0a9-78d20cd54761.jpg')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Protein', 22, 'g'),
  ('Calories', 121, 'kcal'),
  ('Carbohydrates', 4, 'g'),
  ('Fat', 2, 'g'),
  ('Leucine', 2100, 'mg')
) AS n(name, amount, unit);

-- 3. Crunch Bar (White Chocolate Crisp) (score: 93)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status, retail_price, image_url)
  VALUES ('Crunch Bar (White Chocolate Crisp)', 'Warrior', 'protein-bar', 64, 'g', 12, 'tll_reviewed', 'active', 23.99,
    'https://cdn.shopify.com/s/files/1/0335/8726/5581/products/b174-cv-pd-1.png')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Protein', 20, 'g'),
  ('Calories', 212, 'kcal'),
  ('Carbohydrates', 14, 'g'),
  ('Fat', 8, 'g'),
  ('Sugar', 2, 'g'),
  ('Fibre', 3, 'g')
) AS n(name, amount, unit);

-- 4. EAA Powder (score: 88)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status, retail_price, image_url)
  VALUES ('EAA Powder', 'Warrior', 'eaa', 12, 'g', 30, 'tll_reviewed', 'active', 13.99,
    'https://cdn.shopify.com/s/files/1/0335/8726/5581/files/300G-WARRIOR-EAA-TUB-BR_c93d212f-15d6-4340-a67c-67fe96256ea3.jpg')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('L-Leucine', 2500, 'mg'),
  ('L-Isoleucine', 1250, 'mg'),
  ('L-Valine', 1250, 'mg'),
  ('L-Lysine', 1000, 'mg'),
  ('L-Threonine', 700, 'mg'),
  ('L-Phenylalanine', 600, 'mg'),
  ('L-Methionine', 300, 'mg'),
  ('L-Histidine', 300, 'mg'),
  ('L-Tryptophan', 100, 'mg')
) AS n(name, amount, unit);

-- Verify
SELECT name, brand, category, score_check.score, retail_price, image_url IS NOT NULL as has_image
FROM public.products
LEFT JOIN (VALUES
  ('Creatine Monohydrate', 96),
  ('Whey Protein', 57),
  ('Crunch Bar (White Chocolate Crisp)', 93),
  ('EAA Powder', 88)
) AS score_check(pname, score) ON score_check.pname = products.name
WHERE brand = 'Warrior'
ORDER BY name;
