-- Offline preparation. Roll back before accepting new writes to merged relationships.
BEGIN;
LOCK TABLE public.products, public.product_nutrients, public.reviews,
  public.stack_products, public.user_favourites, public.user_stacks IN ACCESS EXCLUSIVE MODE;
DO $rollback$
DECLARE a record; collision jsonb; restored_count int; stack_snapshot jsonb; stacks_before jsonb;
BEGIN
  -- A second rollback is a no-op, including the EssentialMAX correction.
  IF to_regclass('tll_merge_private.merged_product_archive') IS NULL THEN RETURN; END IF;
  -- Validate BEFORE rollback item triggers run. Do not erase post-merge stack edits.
  FOR stack_snapshot IN SELECT DISTINCT v FROM tll_merge_private.merged_product_archive ar
    CROSS JOIN LATERAL jsonb_array_elements(ar.stacks_after) v LOOP
    IF NOT EXISTS (SELECT 1 FROM public.user_stacks s
      WHERE s.id = (stack_snapshot->>'id')::uuid AND to_jsonb(s) = stack_snapshot) THEN
      RAISE EXCEPTION 'Rollback stack metadata changed or missing; reconcile before rollback';
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(v ORDER BY v->>'id'), '[]'::jsonb) INTO stacks_before FROM (
    SELECT DISTINCT v FROM tll_merge_private.merged_product_archive ar
      CROSS JOIN LATERAL jsonb_array_elements(ar.stacks_before) v
  ) snapshots;
  FOR a IN SELECT * FROM tll_merge_private.merged_product_archive ORDER BY legacy_product_id LOOP
    INSERT INTO public.products SELECT (jsonb_populate_record(NULL::public.products, a.product)).*;
    INSERT INTO public.product_nutrients SELECT * FROM jsonb_populate_recordset(NULL::public.product_nutrients, a.nutrients);
    UPDATE public.reviews SET product_id = a.legacy_product_id WHERE id = ANY(a.moved_reviews) AND product_id = a.parent_product_id;
    GET DIAGNOSTICS restored_count = ROW_COUNT;
    IF restored_count IS DISTINCT FROM cardinality(a.moved_reviews) THEN
      RAISE EXCEPTION 'Rollback reviews count mismatch for %', a.legacy_product_id;
    END IF;
    UPDATE public.stack_products SET product_id = a.legacy_product_id WHERE id = ANY(a.moved_stack_products) AND product_id = a.parent_product_id;
    GET DIAGNOSTICS restored_count = ROW_COUNT;
    IF restored_count IS DISTINCT FROM cardinality(a.moved_stack_products) THEN
      RAISE EXCEPTION 'Rollback stack_products count mismatch for %', a.legacy_product_id;
    END IF;
    UPDATE public.user_favourites SET product_id = a.legacy_product_id WHERE id = ANY(a.moved_favourites) AND product_id = a.parent_product_id;
    GET DIAGNOSTICS restored_count = ROW_COUNT;
    IF restored_count IS DISTINCT FROM cardinality(a.moved_favourites) THEN
      RAISE EXCEPTION 'Rollback user_favourites count mismatch for %', a.legacy_product_id;
    END IF;
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
      UPDATE public.products SET serving_size = 13, name = 'EssentialMax', serving_unit = a.parent_before->>'serving_unit',
        updated_at = (a.parent_before->>'updated_at')::timestamptz WHERE id = a.parent_product_id AND serving_size = 15 AND name = 'EssentialMAX' AND serving_unit = 'g';
      GET DIAGNOSTICS restored_count = ROW_COUNT;
      IF restored_count <> 1 THEN RAISE EXCEPTION 'Rollback EssentialMAX changed or missing'; END IF;
    END IF;
    DELETE FROM public.product_size_options WHERE product_id = a.parent_product_id
      AND legacy_product_id IN (a.parent_product_id, a.legacy_product_id);
    DELETE FROM tll_merge_private.merged_product_archive WHERE legacy_product_id = a.legacy_product_id;
  END LOOP;
  -- Item triggers have now finished; restore their original parent metadata once.
  FOR stack_snapshot IN SELECT value FROM jsonb_array_elements(stacks_before) LOOP
    UPDATE public.user_stacks SET revision = (stack_snapshot->>'revision')::bigint,
      updated_at = (stack_snapshot->>'updated_at')::timestamptz
      WHERE id = (stack_snapshot->>'id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rollback stack snapshot missing'; END IF;
  END LOOP;
END $rollback$;
COMMIT;
