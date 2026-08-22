-- Buy URL backfill — 3 Aug 2026
-- Run in the Supabase SQL Editor. Safe to re-run (plain UPDATEs by id).
--
-- Part 1: Bulk products whose buy_url bypassed the Awin affiliate wrapper.
-- Part 2: Amazon direct product pages for products that were falling back to
--         an Amazon *search* link.
--
-- Every Amazon ASIN below was verified twice: found via search, then confirmed
-- by loading amazon.co.uk/dp/<ASIN> and reading the live product title, price
-- and stock status. No ASIN was inferred or guessed.
--
-- NOTE ON PRICES: the Amazon price differs from products.retail_price in every
-- case (see comments). retail_price is NOT updated here — see the report.

BEGIN;

-- ============================================================
-- Part 1 — Bulk: restore Awin tracking (currently earning nothing)
-- ============================================================
-- These two rows held raw bulk.com URLs. lib/affiliate.ts returns buy_url
-- verbatim when present, so they bypassed bulkSearch()'s Awin deeplink and
-- generated zero commission. Re-wrapped with awinmid=4822 / awinaffid=2919631,
-- pointing at the same destination product pages.

-- Bulk — Creatine Monohydrate
UPDATE products SET buy_url =
  'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fcreatine-monohydrate%2Fbpb-cmon-0000'
WHERE id = 'f311ed1d-0f55-44f5-8953-c35d84e6b5ae';

-- Bulk — Pure Whey Isolate
UPDATE products SET buy_url =
  'https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=https%3A%2F%2Fwww.bulk.com%2Fuk%2Fproducts%2Fpure-whey-isolate-90%2Fbpb-wpi9-0000'
WHERE id = '2429dd22-45c3-4088-acf3-4148782bcb00';


-- ============================================================
-- Part 2 — Amazon: verified direct product pages
-- ============================================================

-- Per4m — Advanced Whey
-- Verified: "Per4m Whey Advanced Protein (900g) Vanilla Creme" — in stock, £39.12
-- Site record: 30g x 30 servings = 900g, retail_price £34.99. Size matches exactly.
-- Flavour note: site record is flavour-agnostic; Vanilla Creme chosen as the listed SKU.
UPDATE products SET buy_url = 'https://www.amazon.co.uk/dp/B0DR3JZX8S?tag=theliftinglab-21'
WHERE id = '7cb28341-5b19-4a0b-b49c-e77bb27182c4';

-- USN — BlueLab 100% Whey
-- Verified: "USN BlueLab Whey Protein Powder | Strawberry | 908g - 26 Servings" — in stock, £30.59
-- Site record: 34g x 26 servings = 884g, retail_price £27.99. Serving count matches exactly.
UPDATE products SET buy_url = 'https://www.amazon.co.uk/dp/B07DMCB82S?tag=theliftinglab-21'
WHERE id = '767210a6-f16f-48f1-bc45-dc7bc41dc302';

-- Liquid IV — Hydration Multiplier
-- Verified: "Liquid I.V. Hydration Multiplier Electrolyte Mix, Lemon Lime, 16 Sticks" — in stock, £18.19
-- Site record: 15 servings, retail_price £24.99. Amazon pack is 16 sticks (site says 15).
UPDATE products SET buy_url = 'https://www.amazon.co.uk/dp/B0F8HHM1XM?tag=theliftinglab-21'
WHERE id = '5e13c87a-1d35-4dd5-a141-43a281bef5e5';

-- Grenade — Pre-Workout
-- Verified: "Grenade High Caffeine Pre Workout Powder, Berried Alive, 330g | 20 Servings" — in stock, £8.00
-- Site record: 20 servings, retail_price £24.99. Serving count matches exactly.
-- WARNING: Amazon is £8.00 vs the £24.99 on the site — check this listing is the
-- full tub and not a clearance/short-dated line before relying on the price.
UPDATE products SET buy_url = 'https://www.amazon.co.uk/dp/B0CKFJSQL1?tag=theliftinglab-21'
WHERE id = '943638a7-3c67-4c92-900c-ab0bfa9d7a60';

COMMIT;

-- Verify after running:
-- SELECT brand, name, buy_url FROM products WHERE id IN (
--   'f311ed1d-0f55-44f5-8953-c35d84e6b5ae','2429dd22-45c3-4088-acf3-4148782bcb00',
--   '7cb28341-5b19-4a0b-b49c-e77bb27182c4','767210a6-f16f-48f1-bc45-dc7bc41dc302',
--   '5e13c87a-1d35-4dd5-a141-43a281bef5e5','943638a7-3c67-4c92-900c-ab0bfa9d7a60');
