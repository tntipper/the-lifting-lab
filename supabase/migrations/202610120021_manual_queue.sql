-- T11 static only: no hosted migration application.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table tll_harness_private.manual_queue (
  id uuid primary key default gen_random_uuid(),
  failure_key text not null unique check (failure_key ~ '^[0-9a-f]{64}$'),
  job text not null check (job in ('stock-price','orders','tracking')),
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  order_id text check (order_id ~ '^gid://shopify/Order/[1-9][0-9]*$'),
  supplier text check (supplier in ('tropship','bodypower','supplier3')),
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by text check (length(done_by) between 1 and 128),
  check ((status='open' and done_at is null and done_by is null) or
         (status='done' and done_at is not null and done_by is not null and done_at >= created_at))
);
create index manual_queue_open on tll_harness_private.manual_queue(created_at,id) where status='open';
alter table tll_harness_private.manual_queue enable row level security;
revoke all on table tll_harness_private.manual_queue from public, anon, authenticated;
grant select, insert, update on table tll_harness_private.manual_queue to service_role;
commit;
