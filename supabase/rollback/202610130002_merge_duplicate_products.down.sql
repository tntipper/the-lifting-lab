-- Offline preparation. Roll back before accepting new writes to merged relationships.
BEGIN;
LOCK TABLE public.products, public.product_nutrients, public.reviews,
  public.stack_products, public.user_favourites IN ACCESS EXCLUSIVE MODE;
DO $rollback$
DECLARE a record; collision jsonb;
BEGIN
  -- A second rollback is a no-op, including the EssentialMAX correction.
  IF to_regclass('tll_merge_private.merged_product_archive') IS NULL THEN RETURN; END IF;
  FOR a IN SELECT * FROM tll_merge_private.merged_product_archive ORDER BY legacy_product_id LOOP
    INSERT INTO public.products SELECT (jsonb_populate_record(NULL::public.products, a.product)).*;
    INSERT INTO public.product_nutrients SELECT * FROM jsonb_populate_recordset(NULL::public.product_nutrients, a.nutrients);
    UPDATE public.reviews SET product_id = a.legacy_product_id WHERE id = ANY(a.moved_reviews) AND product_id = a.parent_product_id;
    UPDATE public.stack_products SET product_id = a.legacy_product_id WHERE id = ANY(a.moved_stack_products) AND product_id = a.parent_product_id;
    UPDATE public.user_favourites SET product_id = a.legacy_product_id WHERE id = ANY(a.moved_favourites) AND product_id = a.parent_product_id;
    FOR collision IN SELECT value FROM jsonb_array_elements(a.merged_stacks) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.stack_products WHERE id = (collision->'parent'->>'id')::uuid
        AND product_id = a.parent_product_id AND servings_per_day =
          (collision->'parent'->>'servings_per_day')::numeric + (collision->'child'->>'servings_per_day')::numeric) THEN
        RAISE EXCEPTION 'Rollback stack total changed; reconcile before rollback';
      END IF;
      UPDATE public.stack_products SET servings_per_day = (collision->'parent'->>'servings_per_day')::numeric
        WHERE id = (collision->'parent'->>'id')::uuid AND product_id = a.parent_product_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Rollback stack parent missing'; END IF;
      INSERT INTO public.stack_products SELECT (jsonb_populate_record(NULL::public.stack_products, collision->'child')).*;
    END LOOP;
    INSERT INTO public.user_favourites SELECT * FROM jsonb_populate_recordset(NULL::public.user_favourites, a.dropped_favourites);
    IF a.parent_product_id = '2567a955-be92-4f70-b147-f908fa80650c'::uuid THEN
      UPDATE public.products SET serving_size = 13, name = 'EssentialMax',
        updated_at = (a.parent_before->>'updated_at')::timestamptz WHERE id = a.parent_product_id;
    END IF;
  END LOOP;
END $rollback$;
DROP TABLE IF EXISTS public.product_size_options;
DROP SCHEMA IF EXISTS tll_merge_private CASCADE;
COMMIT;
