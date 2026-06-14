-- add-buy-url.sql
-- Adds a nullable buy_url column to products for direct retailer deep-links.
-- When buy_url is set, the app links straight to the product page; when NULL it
-- falls back to a retailer search query (existing behaviour).
-- Idempotent — safe to run multiple times. Run in Supabase SQL Editor.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS buy_url text;
