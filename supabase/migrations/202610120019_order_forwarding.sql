-- T09 STATIC ONLY. Do not apply without approval. Runtime clients remain unbound.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table tll_harness_private.order_inbox (
  id uuid primary key default gen_random_uuid(),
  shop text not null check (shop ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  event_id text not null check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  order_id text not null check (order_id ~ '^gid://shopify/Order/[1-9][0-9]*$'),
  topic text not null default 'orders/paid' check (topic = 'orders/paid'),
  status text not null default 'pending' check (status in ('pending', 'processed', 'manual')),
  last_error_code text check (last_error_code ~ '^[A-Z_]+$'),
  received_at timestamptz not null default now(),
  unique (shop, event_id)
);
create table tll_harness_private.order_plans (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  order_id text not null,
  created_at timestamptz not null default now(),
  unique (shop, order_id)
);
create table tll_harness_private.customer_delivery_payloads (
  plan_id uuid primary key references tll_harness_private.order_plans(id),
  -- AES-256-GCM envelope only. Key stays in server env, never SQL/logs. AAD is the shop/order hash.
  encrypted_address text not null check (btrim(encrypted_address) <> ''),
  -- TODO(Toby): set N days after shipment, approve privacy notice and restricted service role.
  delete_after timestamptz,
  created_at timestamptz not null default now()
);
create table tll_harness_private.supplier_order_batches (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references tll_harness_private.order_plans(id),
  supplier text not null check (supplier in ('tropship', 'bodypower', 'supplier3')),
  local_key text not null unique check (local_key ~ '^[a-f0-9]{64}$'),
  absorbed_dispatch_pence bigint not null check (absorbed_dispatch_pence >= 0),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'accepted', 'rejected', 'manual')),
  supplier_ref text,
  attempts integer not null default 0 check (attempts in (0, 1)),
  spent_at timestamptz,
  last_error_code text check (last_error_code ~ '^[A-Z_]+$'),
  unique (plan_id, supplier),
  check ((attempts = 0 and spent_at is null and status = 'pending') or (attempts = 1 and spent_at is not null and status <> 'pending')),
  check (status <> 'accepted' or btrim(supplier_ref) <> '' and supplier_ref is not null)
);
create table tll_harness_private.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references tll_harness_private.supplier_order_batches(id),
  shop text not null,
  order_id text not null,
  line_id text not null check (line_id ~ '^gid://shopify/LineItem/[1-9][0-9]*$'),
  variant_id text not null check (variant_id ~ '^gid://shopify/ProductVariant/[1-9][0-9]*$'),
  mapping_id uuid not null references tll_mapping_private.product_mapping(id),
  supplier text not null check (supplier in ('tropship', 'bodypower', 'supplier3')),
  supplier_sku text not null check (btrim(supplier_sku) <> ''),
  quantity integer not null check (quantity > 0),
  local_key text not null unique check (local_key ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'accepted', 'rejected', 'manual')),
  supplier_ref text,
  attempts integer not null default 0 check (attempts in (0, 1)),
  last_error_code text check (last_error_code ~ '^[A-Z_]+$'),
  unique (shop, order_id, line_id, supplier),
  check (status <> 'accepted' or btrim(supplier_ref) <> '' and supplier_ref is not null)
);
create table tll_harness_private.order_reservations (
  supplier_order_id uuid primary key references tll_harness_private.supplier_orders(id),
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved', 'released')),
  created_at timestamptz not null default now()
);
-- Atomically spend an entire supplier group before transport; a crashed worker stays manual.
-- SECURITY INVOKER: only the explicitly privileged server role can call this private function.
create function tll_harness_private.claim_order_submission(p_local_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare claimed_id uuid;
begin
  update tll_harness_private.supplier_order_batches
  set attempts = 1, spent_at = now(), status = 'manual', last_error_code = 'SUBMISSION_IN_PROGRESS'
  where local_key = p_local_key and status = 'pending' and attempts = 0 and spent_at is null
    and exists (select 1 from tll_harness_private.supplier_orders so where so.batch_id = supplier_order_batches.id)
  returning id into claimed_id;
  if claimed_id is null then return false; end if;
  update tll_harness_private.supplier_orders set attempts = 1, status = 'manual', last_error_code = 'SUBMISSION_IN_PROGRESS'
  where batch_id = claimed_id;
  return true;
end;
$$;
revoke all on function tll_harness_private.claim_order_submission(text) from public, anon, authenticated;
grant execute on function tll_harness_private.claim_order_submission(text) to service_role;

alter table tll_harness_private.order_inbox enable row level security;
alter table tll_harness_private.order_plans enable row level security;
alter table tll_harness_private.customer_delivery_payloads enable row level security;
alter table tll_harness_private.supplier_order_batches enable row level security;
alter table tll_harness_private.supplier_orders enable row level security;
alter table tll_harness_private.order_reservations enable row level security;
revoke all on table tll_harness_private.order_inbox, tll_harness_private.order_plans,
  tll_harness_private.customer_delivery_payloads, tll_harness_private.supplier_order_batches,
  tll_harness_private.supplier_orders, tll_harness_private.order_reservations from public, anon, authenticated;
grant select, insert, update on table tll_harness_private.order_inbox, tll_harness_private.order_plans,
  tll_harness_private.customer_delivery_payloads, tll_harness_private.supplier_order_batches,
  tll_harness_private.supplier_orders, tll_harness_private.order_reservations to service_role;
-- Intentionally no deletion grant or automatic retention schedule until Toby chooses N.
-- TODO: planAndReserve binding must lock trusted stock, subtract outstanding reservations, and
-- insert the immutable complete plan/address/batches/lines/reservations in ONE transaction.
-- TODO: recordResult binding updates batch + lines atomically; rejection releases reservations.
-- T11 owns operator UI/alert delivery. Here manual holds live in the private inbox and batch rows.
commit;
