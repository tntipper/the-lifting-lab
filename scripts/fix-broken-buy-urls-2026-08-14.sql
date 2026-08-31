-- Broken buy_url repairs — 14 Aug 2026
-- From a full outbound audit of all 205 products' buy links.
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Every replacement below was fetched and confirmed to return HTTP 200 with the
-- correct product <h1> before being written here. Nothing is guessed.
--
-- Root cause in every case: the stored URL was a specific, now-retired SKU
-- (a discontinued flavour, a short-dated clearance listing, or a third-party
-- retailer's page). Brand sites silently redirect dead product URLs to their
-- homepage rather than 404, so these fail invisibly.

BEGIN;

-- Applied Nutrition | ABE (All Black Everything)
-- WAS: gymstop.co.uk/products/applied-nutrition-abe-all-black-everything -> HTTP 404
-- NOW: the brand's own product page. Verified h1 "ABE All Black Everything - Extremely Potent Pre-Workout Powder"
UPDATE products SET buy_url = 'https://appliednutrition.uk/products/abe-all-black-everything-375g'
WHERE id = 'c0f8dde0-6555-4449-9877-3c7ccd410339';

-- Bio-Synergy | Whey Hey®
-- WAS: /products/bio-synergy-whey-hey -> HTTP 404 (the real slug ends in an encoded ®)
-- NOW: verified h1 "Whey Hey®"
UPDATE products SET buy_url = 'https://bio-synergy.uk/products/bio-synergy-whey-hey%C2%AE'
WHERE id = 'f42a7d2f-f236-48bc-8dc3-38a2b803dad8';

-- CNP Professional | CNP EAA
-- WAS: /products/loaded-eaa-fantasy-series-orange... (discontinued flavour SKU) -> redirected to homepage
-- NOW: verified h1 "CNP Professional Loaded EAA"
UPDATE products SET buy_url = 'https://cnpprofessional.co.uk/products/loaded-eaa'
WHERE id = 'a3483e0b-65f4-4b68-b2aa-0a81efbbb800';

-- CNP Professional | Pro Recover
-- WAS: /products/recover-1-28kg-16-servings-stra... (dead SKU) -> redirected to homepage
-- NOW: verified h1 "CNP Professional Pro Recover"
UPDATE products SET buy_url = 'https://cnpprofessional.co.uk/products/pro-recover'
WHERE id = '24250aa6-3786-4a36-8dfa-384cba90ed01';

-- Reflex Nutrition | One Stop Xtreme
-- WAS: /products/one-stop®-xtreme-short-dated (a SHORT-DATED clearance listing) -> redirected to homepage
-- NOW: verified h1 "One Stop® Xtreme"
UPDATE products SET buy_url = 'https://reflexnutrition.com/products/one-stop-xtreme'
WHERE id = 'abffbfcd-c048-4c70-9cb9-50798fd97d9f';

COMMIT;

-- ============================================================
-- NOT fixed here — these need a decision from you, not a URL swap:
--
-- CNP Professional | CNP Isolate      (444c84df-121b-4ca2-923b-12abfb876ba7)
--   Lands on CNP's homepage. CNP's own site search returns ZERO isolate products
--   for "whey isolate" or "iso" — the product looks discontinued. Delist or repoint.
--
-- PhD Nutrition | Smart Bar (Cookies & Cream)  (7da1faee-bd26-4b52-a718-3bbf5f3ab03b)
--   phd.com HTTP 404. Needs a current PhD URL or delisting.
--
-- Roar Ambition | TestoFuel           (e309e1fa-5f75-44a7-9c0c-06d485622ea8)
--   testofuel.com/en-gb/testofuel-1-month HTTP 404.
--
-- MyProtein | Micellar Casein         (cd61dcae-52e3-4e85-8bac-c3abe7c68ffc)
--   Retired SKU; MyProtein redirects it to the milk-protein CATEGORY page.
--
-- Trek | Protein Flapjack (Cocoa Oat) (0a327a09-db76-483e-88ca-b55aacf3d53f)
--   Redirects to trekbars.com/gb/protein-bars — a "Select your preference"
--   landing page with no add-to-cart.
-- ============================================================
