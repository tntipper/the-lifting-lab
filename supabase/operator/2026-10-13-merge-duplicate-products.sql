-- PREPARATION ONLY: never run against a Supabase project as part of this task.
BEGIN;
-- Serialize catalogue/FK edits, including inserts that could race the archive.
LOCK TABLE public.products, public.product_nutrients, public.reviews,
  public.stack_products, public.user_favourites IN ACCESS EXCLUSIVE MODE;
DO $merge$
DECLARE
  m record; parent public.products%ROWTYPE; child public.products%ROWTYPE;
  item public.stack_products%ROWTYPE; existing public.stack_products%ROWTYPE;
  collisions jsonb; dropped jsonb; reviews_ids uuid[]; stack_ids uuid[]; favourite_ids uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id IN (
    '1fab2546-6a25-4fd9-8e49-abf6bb6b362c', '8ddfc493-0872-4235-ba25-5091ef172b49',
    'e94b13c4-f7fa-42d2-94b2-8dfcda316311', 'b9058eef-f71a-49f7-9672-a264d1a09614',
    '2567a955-be92-4f70-b147-f908fa80650c', '60cbe489-96a8-416e-a11b-243e3277caf3'))
    AND NOT EXISTS (SELECT 1 FROM tll_merge_private.merged_product_archive) THEN
    RAISE NOTICE 'No duplicate catalogue rows or archives; nothing to merge';
    RETURN;
  END IF;
  FOR m IN SELECT * FROM (VALUES
    ('1fab2546-6a25-4fd9-8e49-abf6bb6b362c'::uuid, '8ddfc493-0872-4235-ba25-5091ef172b49'::uuid,
     'Crunch Bar (White Chocolate Crisp)', 'Crunch Bar (White Chocolate Crisp)', 'Warrior', 12, 1, 23.99::numeric, 2.00::numeric, 64, 64, 'protein-bar', 'protein-bar', '12-pack', 'single-bar', '12 × 64g', 'Single 64g bar', 'gid://shopify/ProductVariant/63535202468170'),
    ('e94b13c4-f7fa-42d2-94b2-8dfcda316311'::uuid, 'b9058eef-f71a-49f7-9672-a264d1a09614'::uuid,
     'Whey Protein', 'Whey Protein', 'Warrior', 40, 16, 29.99::numeric, 19.99::numeric, 25, 30, 'whey', 'whey', '40-servings', '16-servings', '40 servings', '16 servings', NULL),
    ('2567a955-be92-4f70-b147-f908fa80650c'::uuid, '60cbe489-96a8-416e-a11b-243e3277caf3'::uuid,
     'EssentialMax', 'EssentialMAX', 'Strom Sports Nutrition', 30, 30, 34.95::numeric, 34.95::numeric, 13, 15, 'eaas', 'intra-workout', NULL, NULL, NULL, NULL, NULL)
  ) AS v(parent_id, child_id, parent_name, child_name, brand, parent_servings, child_servings,
         parent_price, child_price, parent_size, child_size, parent_category, child_category,
         parent_slug, child_slug, parent_label, child_label, variant_id)
  LOOP
    IF EXISTS (SELECT 1 FROM tll_merge_private.merged_product_archive WHERE legacy_product_id = m.child_id) THEN
      IF NOT EXISTS (SELECT 1 FROM tll_merge_private.merged_product_archive WHERE legacy_product_id = m.child_id AND parent_product_id = m.parent_id)
         OR EXISTS (SELECT 1 FROM public.products WHERE id = m.child_id)
         OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = m.parent_id) THEN
        RAISE EXCEPTION 'Inconsistent archived merge %', m.child_id;
      END IF;
      IF m.parent_slug IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.product_size_options WHERE product_id = m.parent_id
          AND slug = m.parent_slug AND legacy_product_id = m.parent_id)
        OR NOT EXISTS (SELECT 1 FROM public.product_size_options WHERE product_id = m.parent_id
          AND slug = m.child_slug AND legacy_product_id = m.child_id)) THEN
        RAISE EXCEPTION 'Archived merge size options missing for %', m.child_id;
      END IF;
      CONTINUE;
    END IF;
    SELECT * INTO parent FROM public.products WHERE id = m.parent_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing parent %', m.parent_id; END IF;
    SELECT * INTO child FROM public.products WHERE id = m.child_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing child %', m.child_id; END IF;
    IF parent.name IS DISTINCT FROM m.parent_name OR child.name IS DISTINCT FROM m.child_name
       OR parent.brand IS DISTINCT FROM m.brand OR child.brand IS DISTINCT FROM m.brand
       OR parent.servings_per_container IS DISTINCT FROM m.parent_servings OR child.servings_per_container IS DISTINCT FROM m.child_servings
       OR parent.retail_price IS DISTINCT FROM m.parent_price OR child.retail_price IS DISTINCT FROM m.child_price
       OR parent.serving_size IS DISTINCT FROM m.parent_size OR child.serving_size IS DISTINCT FROM m.child_size
       OR parent.category IS DISTINCT FROM m.parent_category OR child.category IS DISTINCT FROM m.child_category THEN
      RAISE EXCEPTION 'Catalogue guard mismatch for % / %', m.parent_id, m.child_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.reviews c JOIN public.reviews p ON p.user_id = c.user_id
       WHERE c.product_id = child.id AND p.product_id = parent.id) THEN
      RAISE EXCEPTION 'Review collision requires manual decision for %', child.id;
    END IF;
    IF m.parent_slug IS NOT NULL THEN
      INSERT INTO public.product_size_options(product_id, slug, label, serving_size, serving_unit,
        servings_per_container, retail_price, buy_url, shopify_variant_id, legacy_product_id, sort, nutrients)
      VALUES (parent.id, m.parent_slug, m.parent_label, parent.serving_size, 'g',
        parent.servings_per_container, parent.retail_price, parent.buy_url, m.variant_id, parent.id, 0, NULL),
        (parent.id, m.child_slug, m.child_label, child.serving_size, 'g',
        child.servings_per_container, child.retail_price, child.buy_url, NULL, child.id, 1,
          coalesce((SELECT jsonb_agg(jsonb_build_object('nutrient_name', n.nutrient_name,
            'amount', n.amount, 'unit', n.unit) ORDER BY n.nutrient_name)
            FROM public.product_nutrients n WHERE n.product_id = child.id), '[]'::jsonb));
    END IF;
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO reviews_ids FROM public.reviews WHERE product_id = child.id;
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO stack_ids FROM public.stack_products WHERE product_id = child.id
      AND NOT EXISTS (SELECT 1 FROM public.stack_products sp WHERE sp.stack_id = stack_products.stack_id AND sp.product_id = parent.id);
    SELECT coalesce(array_agg(f.id), '{}'::uuid[]) INTO favourite_ids FROM public.user_favourites f WHERE f.product_id = child.id
      AND NOT EXISTS (SELECT 1 FROM public.user_favourites fp WHERE fp.user_id = f.user_id AND fp.product_id = parent.id);
    SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]') INTO dropped FROM public.user_favourites f WHERE f.product_id = child.id
      AND EXISTS (SELECT 1 FROM public.user_favourites fp WHERE fp.user_id = f.user_id AND fp.product_id = parent.id);
    SELECT coalesce(jsonb_agg(jsonb_build_object('child', to_jsonb(sp), 'parent', to_jsonb(pp))), '[]') INTO collisions
      FROM public.stack_products sp JOIN public.stack_products pp ON pp.stack_id = sp.stack_id AND pp.product_id = parent.id WHERE sp.product_id = child.id;
    -- Archive BEFORE any FK movement, collision deletion or child deletion.
    INSERT INTO tll_merge_private.merged_product_archive(legacy_product_id, parent_product_id, product, nutrients,
      moved_reviews, moved_stack_products, moved_favourites, dropped_favourites, merged_stacks, parent_before)
    VALUES (child.id, parent.id, to_jsonb(child), coalesce((SELECT jsonb_agg(to_jsonb(n)) FROM public.product_nutrients n WHERE n.product_id = child.id), '[]'),
      reviews_ids, stack_ids, favourite_ids, dropped, collisions, to_jsonb(parent));
    UPDATE public.reviews SET product_id = parent.id WHERE id = ANY(reviews_ids);
    DELETE FROM public.user_favourites WHERE id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(dropped) x);
    UPDATE public.user_favourites SET product_id = parent.id WHERE id = ANY(favourite_ids);
    FOR item IN SELECT * FROM public.stack_products WHERE product_id = child.id LOOP
      SELECT * INTO existing FROM public.stack_products WHERE stack_id = item.stack_id AND product_id = parent.id;
      IF FOUND THEN
        IF existing.servings_per_day + item.servings_per_day > 10 THEN
          RAISE EXCEPTION 'Merged stack servings exceed 10 for stack %', item.stack_id;
        END IF;
        UPDATE public.stack_products SET servings_per_day = existing.servings_per_day + item.servings_per_day WHERE id = existing.id;
        DELETE FROM public.stack_products WHERE id = item.id;
      ELSE
        UPDATE public.stack_products SET product_id = parent.id WHERE id = item.id;
      END IF;
    END LOOP;
    IF m.parent_slug IS NULL THEN
      UPDATE public.products SET serving_size = 15, name = 'EssentialMAX', updated_at = now() WHERE id = parent.id;
    END IF;
    DELETE FROM public.products WHERE id = child.id;
  END LOOP;
END $merge$;
COMMIT;
