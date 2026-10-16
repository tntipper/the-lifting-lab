-- T04: saved mapping only; no seed, publication, price or supplier writes.
-- Canonical Shopify GIDs prevent numeric/GID aliases bypassing variant uniqueness.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema tll_mapping_private;
revoke all on schema tll_mapping_private from public, anon, authenticated;
grant usage on schema tll_mapping_private to service_role;

create table tll_mapping_private.product_mapping (
  id uuid primary key default gen_random_uuid(),
  comparison_product_id text not null check (btrim(comparison_product_id) <> ''),
  status text not null check (status in ('store', 'affiliate', 'not_sold')),
  shopify_product_id text check (shopify_product_id ~ '^gid://shopify/Product/[1-9][0-9]*$'),
  shopify_variant_id text unique check (shopify_variant_id ~ '^gid://shopify/ProductVariant/[1-9][0-9]*$'),
  handle text,
  supplier text,
  supplier_sku text,
  ean text,
  pack jsonb,
  flavour text,
  cost_ex_vat numeric(14,4) check (cost_ex_vat >= 0 and cost_ex_vat <> 'NaN'::numeric),
  price_auto boolean not null default false,
  active boolean not null default false,
  approval_reference text,
  -- Optional reviewed ExactMapping evidence. Never inferred from titles or approval_reference.
  review jsonb,
  mapping_status text check (mapping_status in ('exact', 'ambiguous', 'unknown')),
  mapping_source text check (mapping_source in ('verified_labels', 'name_match', 'feed_estimate', 'unknown')),
  shop_identity jsonb,
  supplier_identity jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_identity_required check (status <> 'store' or (
    shopify_product_id is not null and shopify_variant_id is not null
    and nullif(btrim(handle), '') is not null and nullif(btrim(supplier), '') is not null
    and nullif(btrim(supplier_sku), '') is not null and cost_ex_vat is not null)),
  constraint active_approval_required check (not active or nullif(btrim(approval_reference), '') is not null),
  constraint automatic_price_requires_active check (not price_auto or (active and status = 'store'))
);

alter table tll_mapping_private.product_mapping enable row level security;
revoke all on table tll_mapping_private.product_mapping from public, anon, authenticated;
grant select, insert, update, delete on table tll_mapping_private.product_mapping to service_role;
-- No client policy or public cost view. service_role is server-only and bypasses RLS.

create function tll_mapping_private.touch_product_mapping()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function tll_mapping_private.touch_product_mapping() from public, anon, authenticated;
create trigger product_mapping_updated_at before update on tll_mapping_private.product_mapping
for each row execute function tll_mapping_private.touch_product_mapping();

comment on table tll_mapping_private.product_mapping is
  'One saved supplier offer per unique Shopify variant; costs private. Multiple suppliers for the same variant require a later reviewed schema change.';
commit;
