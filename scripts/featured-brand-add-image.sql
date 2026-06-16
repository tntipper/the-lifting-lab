-- Add image_url column to featured_brands and set Bulk banner image.
-- Run in Supabase SQL Editor.

ALTER TABLE public.featured_brands ADD COLUMN IF NOT EXISTS image_url text;

UPDATE public.featured_brands
SET image_url = '/ad-bulk-summer.jpg'
WHERE brand_name = 'Bulk' AND active = true;
