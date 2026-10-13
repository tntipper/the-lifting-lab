-- Schema only: safe when the catalogue is empty. Data merge is an operator script.
BEGIN;
CREATE TABLE IF NOT EXISTS public.product_size_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text NOT NULL, serving_size numeric, serving_unit text,
  servings_per_container int, retail_price numeric, buy_url text,
  shopify_variant_id text, legacy_product_id uuid UNIQUE,
  nutrients jsonb, -- NULL uses the parent product_nutrients label.
  sort int NOT NULL DEFAULT 0, UNIQUE(product_id, slug)
);
ALTER TABLE public.product_size_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_size_options FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_size_options TO anon, authenticated;
DROP POLICY IF EXISTS active_product_sizes ON public.product_size_options;
CREATE POLICY active_product_sizes ON public.product_size_options FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'active'));
CREATE SCHEMA IF NOT EXISTS tll_merge_private;
REVOKE ALL ON SCHEMA tll_merge_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS tll_merge_private.merged_product_archive (
  legacy_product_id uuid PRIMARY KEY, parent_product_id uuid,
  product jsonb, nutrients jsonb, moved_reviews uuid[], moved_stack_products uuid[],
  moved_favourites uuid[], dropped_favourites jsonb, merged_at timestamptz DEFAULT now(),
  -- Colliding stack rows need full snapshots and original parent totals for lossless undo.
  merged_stacks jsonb NOT NULL DEFAULT '[]', parent_before jsonb
);
ALTER TABLE tll_merge_private.merged_product_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA tll_merge_private FROM PUBLIC, anon, authenticated;
COMMIT;
