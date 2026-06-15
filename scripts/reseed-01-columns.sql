-- reseed-01-columns.sql
-- Adds the Path A flag/metric columns that the original seed never created.
-- Idempotent — safe to run multiple times. Run FIRST, in Supabase SQL Editor.
-- (retail_price, informed_sport, buy_url, image_url already exist from earlier migrations.)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS proprietary_blend boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS amino_spiked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS protein_yield numeric(5,2);

-- Belt-and-braces: ensure the price/cert columns exist even on a fresh DB.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS retail_price numeric(8,2),
  ADD COLUMN IF NOT EXISTS informed_sport boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS buy_url text,
  ADD COLUMN IF NOT EXISTS image_url text;
