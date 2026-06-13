-- Creates the featured_brands table used by the homepage Featured Placement slot.
-- Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.featured_brands (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name text NOT NULL,
  tagline text,
  cta_text text DEFAULT 'Shop Now',
  cta_url text NOT NULL,
  active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Example row (edit before enabling):
-- INSERT INTO public.featured_brands (brand_name, tagline, cta_text, cta_url, active, display_order)
-- VALUES ('Bulk', 'Informed Sport certified. Used by athletes.', 'Shop Bulk', 'https://www.bulk.com/uk/', true, 0);
