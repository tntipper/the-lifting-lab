-- T10 STATIC ONLY. No hosted application; private runtime remains unbound.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table tll_harness_private.supplier_orders
  add column fulfilled_quantity integer not null default 0 check (fulfilled_quantity >= 0),
  add column tracking_reserved_quantity integer not null default 0 check (tracking_reserved_quantity >= 0),
  add constraint supplier_orders_tracking_quantity_check check (fulfilled_quantity + tracking_reserved_quantity <= quantity);
-- One stable supplier parcel key; immutable fingerprint catches changed tracking/line evidence.
-- In-progress survives a crash; uncertain survives timeout. Neither can be automatically resubmitted.
create table tll_harness_private.tracking_attempts (
  local_key text primary key check (local_key ~ '^[a-f0-9]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  shop text not null,
  order_id text not null,
  lines jsonb not null check (jsonb_typeof(lines)='array' and jsonb_array_length(lines)>0),
  request jsonb not null check (jsonb_typeof(request)='object'),
  status text not null default 'in_progress' check (status in ('in_progress','completed','rejected','uncertain')),
  fulfillment_id text check (fulfillment_id ~ '^gid://shopify/Fulfillment/[1-9][0-9]*$'),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (shop,order_id) references tll_harness_private.order_plans(shop,order_id),
  check ((status='completed' and fulfillment_id is not null) or (status<>'completed' and fulfillment_id is null))
);
alter table tll_harness_private.tracking_attempts enable row level security;
revoke all on table tll_harness_private.tracking_attempts from public, anon, authenticated;
grant select, insert, update on table tll_harness_private.tracking_attempts to service_role;
-- No queue, alert delivery or automatic reconciliation. T11 owns operator presentation.
commit;
