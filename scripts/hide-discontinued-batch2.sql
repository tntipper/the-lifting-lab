-- hide-discontinued-batch2.sql
-- Pre-launch data-quality pass #2: hide products confirmed DISCONTINUED / not sold
-- direct anywhere, so they never fall back to a (misleading) retailer search link.
--
-- Pattern matches scripts/replace-discontinued-products.sql: we set status='inactive'
-- rather than DELETE. Inactive products are hidden from the category tile grid but
-- preserved for data integrity and avoid breaking review/points foreign keys.
-- A verified, in-stock replacement (with full formulation) for each is on the
-- approval shortlist for Toby to sign off before any INSERT — we do NOT auto-insert
-- scraped formulation (standing rule: never add an unscoreable product).
--
-- Idempotent. Run in Supabase SQL Editor.

-- PREREQUISITE: the original products_status_check only allowed
-- ('active','pending','rejected'), so SET status='inactive' was rejected
-- (ERROR 23514). Widen the constraint to permit 'inactive' (the app only ever
-- shows status='active', so inactive rows are hidden automatically).
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check
  CHECK (status IN ('active','pending','rejected','inactive'));

UPDATE public.products SET status = 'inactive' WHERE brand = 'Optimum Nutrition'      AND name = 'Gold Standard Gainer';      -- delisted on ON UK; nearest live = Serious Mass (already in DB, now direct)
UPDATE public.products SET status = 'inactive' WHERE brand = 'Optimum Nutrition'      AND name = 'Protein Crispy Bar';        -- delisted; nearest live = ON Chocolate Brownie Crunch Protein Bar
UPDATE public.products SET status = 'inactive' WHERE brand = 'Bulk'                   AND name = 'Complete EAA';               -- no live bulk.com UK page; nearest = Bulk Essential Amino Acids
UPDATE public.products SET status = 'inactive' WHERE brand = 'Bulk'                   AND name = 'Complete Intra-Workout';     -- no live bulk.com UK product page; nearest = Bulk Essential Amino Acids / Informed BCAA
UPDATE public.products SET status = 'inactive' WHERE brand = 'Efectiv Nutrition'      AND name = 'Intra';                      -- Intra Fuel URL redirects to homepage; no replacement on efectivnutrition.com
UPDATE public.products SET status = 'inactive' WHERE brand = 'Strom Sports Nutrition' AND name = 'IntraMAX';                    -- not on stromsports.com; nearest = Strom EssentialMAX EAA
UPDATE public.products SET status = 'inactive' WHERE brand = 'Strom Nutrition'        AND name = 'Systimax';                   -- not found anywhere; possible rename to SystolMAX (different product) — verify
UPDATE public.products SET status = 'inactive' WHERE brand = 'PhD Nutrition'          AND name = 'Synergy ISO-7';              -- gone from phd.com own store
UPDATE public.products SET status = 'inactive' WHERE brand = 'PhD Nutrition'          AND name = 'Night Recovery';             -- gone from phd.com own store

-- VERIFY
SELECT brand, name, status, buy_url
FROM public.products
WHERE (brand = 'Optimum Nutrition' AND name IN ('Gold Standard Gainer','Protein Crispy Bar'))
   OR (brand = 'Bulk' AND name IN ('Complete EAA','Complete Intra-Workout'))
   OR (brand = 'Efectiv Nutrition' AND name = 'Intra')
   OR (brand = 'Strom Sports Nutrition' AND name = 'IntraMAX')
   OR (brand = 'Strom Nutrition' AND name = 'Systimax')
   OR (brand = 'PhD Nutrition' AND name IN ('Synergy ISO-7','Night Recovery'))
ORDER BY brand, name;
