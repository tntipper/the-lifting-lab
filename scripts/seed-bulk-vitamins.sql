-- Bulk vitamins & minerals expansion
-- Run in Supabase SQL Editor
-- Categories: heart-health, liver-health, omega-3, joint-health, vitamin-c, magnesium, vitamin-d, sleep-recovery

-- Omega-3 Fish Oil
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Omega-3 Fish Oil', 'Bulk', 'omega-3', 2, 'softgel', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('EPA', 660, 'mg'),
  ('DHA', 440, 'mg'),
  ('Total Omega-3', 1100, 'mg')
) AS n(name, amount, unit);

-- CoQ10 (heart health)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('CoQ10 200mg', 'Bulk', 'heart-health', 1, 'capsule', 60, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Coenzyme Q10', 200, 'mg')
) AS n(name, amount, unit);

-- Vitamin K2 + D3 (heart health / bone)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Vitamin D3 & K2', 'Bulk', 'heart-health', 1, 'softgel', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Vitamin D3', 25, 'mcg'),
  ('Vitamin K2 (MK-7)', 100, 'mcg')
) AS n(name, amount, unit);

-- Plant Sterols (heart health — cholesterol)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Plant Sterols', 'Bulk', 'heart-health', 1, 'tablet', 60, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Plant Sterols', 800, 'mg')
) AS n(name, amount, unit);

-- Milk Thistle (liver health)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Milk Thistle Extract 5000mg', 'Bulk', 'liver-health', 1, 'tablet', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Milk Thistle Extract (80% silymarin)', 5000, 'mg'),
  ('Silymarin', 280, 'mg')
) AS n(name, amount, unit);

-- NAC N-Acetyl Cysteine (liver health / antioxidant)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('NAC N-Acetyl Cysteine', 'Bulk', 'liver-health', 1, 'capsule', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('N-Acetyl Cysteine', 600, 'mg')
) AS n(name, amount, unit);

-- Alpha Lipoic Acid (liver / antioxidant)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Alpha Lipoic Acid 300mg', 'Bulk', 'liver-health', 1, 'capsule', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Alpha Lipoic Acid', 300, 'mg')
) AS n(name, amount, unit);

-- Vitamin C (high-dose)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Vitamin C 1000mg', 'Bulk', 'vitamin-c', 1, 'tablet', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Vitamin C', 1000, 'mg')
) AS n(name, amount, unit);

-- Magnesium Bisglycinate (high-absorption form)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Magnesium Bisglycinate', 'Bulk', 'magnesium', 4, 'capsule', 60, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Magnesium', 500, 'mg')
) AS n(name, amount, unit);

-- Vitamin D3 4000IU (standalone — TRT-adjacent, immune, test support)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Vitamin D3 4000IU', 'Bulk', 'vitamin-d', 1, 'softgel', 365, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Vitamin D3', 100, 'mcg')
) AS n(name, amount, unit);

-- Complete Multivitamin (Bulk's version)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Complete Multivitamin Complex', 'Bulk', 'multivitamin', 1, 'tablet', 60, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Vitamin A', 800, 'mcg'),
  ('Vitamin C', 80, 'mg'),
  ('Vitamin D3', 5, 'mcg'),
  ('Vitamin E', 12, 'mg'),
  ('Vitamin B6', 1.4, 'mg'),
  ('Vitamin B12', 2.5, 'mcg'),
  ('Folic Acid', 200, 'mcg'),
  ('Zinc', 10, 'mg'),
  ('Magnesium', 56, 'mg'),
  ('Iron', 14, 'mg')
) AS n(name, amount, unit);

-- Glucosamine & Chondroitin (joint health)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Glucosamine & Chondroitin', 'Bulk', 'joint-health', 3, 'tablet', 90, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Glucosamine Sulphate', 1500, 'mg'),
  ('Chondroitin Sulphate', 1200, 'mg'),
  ('Vitamin C', 80, 'mg')
) AS n(name, amount, unit);

-- Complete Sleep (magnesium + ashwagandha + melatonin — sleep/recovery)
WITH p AS (
  INSERT INTO public.products (name, brand, category, serving_size, serving_unit, servings_per_container, source, status)
  VALUES ('Complete Sleep', 'Bulk', 'sleep-recovery', 4, 'capsule', 30, 'tll_reviewed', 'active')
  RETURNING id
)
INSERT INTO public.product_nutrients (product_id, nutrient_name, amount, unit)
SELECT p.id, n.name, n.amount, n.unit FROM p,
(VALUES
  ('Magnesium', 200, 'mg'),
  ('Ashwagandha Extract (KSM-66)', 600, 'mg'),
  ('L-Theanine', 200, 'mg'),
  ('Melatonin', 1, 'mg')
) AS n(name, amount, unit);
