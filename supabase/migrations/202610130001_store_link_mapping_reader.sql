-- Read reviewed link evidence without exposing the private schema or cost columns.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create function public.tll_store_link_mapping_rows(product_ids text[])
returns table (
  comparison_product_id text, status text, shopify_product_id text, shopify_variant_id text,
  handle text, supplier text, supplier_sku text, pack jsonb, flavour text,
  active boolean, approval_reference text, review jsonb, mapping_status text,
  mapping_source text, shop_identity jsonb, supplier_identity jsonb
)
language sql stable security definer set search_path = pg_catalog as $$
  select m.comparison_product_id, m.status, m.shopify_product_id, m.shopify_variant_id,
    m.handle, m.supplier, m.supplier_sku, m.pack, m.flavour,
    m.active, m.approval_reference, m.review, m.mapping_status,
    m.mapping_source, m.shop_identity, m.supplier_identity
  from tll_mapping_private.product_mapping m
  where m.active = true and m.status = 'store' and m.comparison_product_id = any(product_ids);
$$;
revoke all on function public.tll_store_link_mapping_rows(text[]) from public, anon, authenticated;
grant execute on function public.tll_store_link_mapping_rows(text[]) to service_role;
notify pgrst, 'reload schema';
commit;
